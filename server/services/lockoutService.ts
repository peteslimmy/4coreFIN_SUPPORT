import { supabase } from '../supabase';
import { logger, logSecurityEvent } from '../logger';
import { escapeLike } from '../lib/escapeLike';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface LockoutResult {
  locked: boolean;
  attemptsRemaining: number;
  lockedUntil?: string;
}

/**
 * Error thrown when the lockout check cannot be evaluated. The login route
 * maps this to a 503 so storage failures can never silently disable the
 * brute-force gate (SEC-05: fail closed).
 */
export class LockoutUnavailableError extends Error {
  status = 503;
  constructor() {
    super('Login temporarily unavailable');
    this.name = 'LockoutUnavailableError';
  }
}

/** True when a Supabase error means "no matching row" (PGRST116 from .single()). */
function isNoRowError(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === 'PGRST116';
}

/**
 * Check if account is currently locked
 */
export async function isAccountLocked(email: string): Promise<LockoutResult> {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, failed_login_attempts, locked_until, last_failed_login')
    .ilike('email', escapeLike(email))
    .single();

  if (error) {
    if (isNoRowError(error)) {
      // Unknown/unprovisioned account — nothing to lock.
      return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS };
    }
    // Real storage failure: we cannot prove the account is not locked, so
    // refuse the attempt instead of silently bypassing the gate (SEC-05).
    logger.error({ err: error }, 'isAccountLocked read error — failing closed');
    throw new LockoutUnavailableError();
  }
  if (!user) {
    return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS };
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return {
      locked: true,
      attemptsRemaining: 0,
      lockedUntil: user.locked_until,
    };
  }

  // Lock expired - clear it
  if (user.locked_until) {
    await clearFailedAttempts(user.id);
    return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS };
  }

  return {
    locked: false,
    attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - (user.failed_login_attempts || 0)),
  };
}

/**
 * Record a failed login attempt. The increment is atomic via the
 * record_failed_login RPC (migration 079), preventing the TOCTOU race where
 * two concurrent logins both read N and write N+1 and never reach the lock
 * threshold. Falls back to the legacy read-modify-write path when the RPC has
 * not been applied yet.
 */
export async function recordFailedLogin(email: string, ip?: string, userAgent?: string): Promise<LockoutResult> {
  // First check if already locked (fast path — no write)
  const { data: existing, error: findError } = await supabase
    .from('users')
    .select('id, failed_login_attempts, locked_until')
    .ilike('email', escapeLike(email))
    .single();

  if (findError) {
    if (isNoRowError(findError)) {
      logSecurityEvent('failed_login_unknown_user', 'medium', {
        email,
        ip,
        userAgent,
        details: 'Login attempt for non-existent account',
      });
      return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS };
    }
    // Storage failure while recording an attempt: the brute-force counter
    // cannot work, so fail closed instead of silently losing the count.
    logger.error({ err: findError }, 'recordFailedLogin lookup error — failing closed');
    throw new LockoutUnavailableError();
  }
  if (!existing) {
    logSecurityEvent('failed_login_unknown_user', 'medium', {
      email,
      ip,
      userAgent,
      details: 'Login attempt for non-existent account',
    });
    return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS };
  }

  if (existing.locked_until && new Date(existing.locked_until) > new Date()) {
    return { locked: true, attemptsRemaining: 0, lockedUntil: existing.locked_until };
  }

  const { data: rpcRows, error: rpcError } = await supabase.rpc('record_failed_login', {
    p_user_id: existing.id,
  });

  let newAttempts: number;
  let locked = false;
  let lockedUntil: string | undefined;

  if (!rpcError && Array.isArray(rpcRows) && rpcRows.length > 0) {
    newAttempts = rpcRows[0].attempts ?? 0;
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      locked = true;
      lockedUntil = rpcRows[0].locked_until
        ?? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
    }
  } else {
    if (rpcError) {
      logger.info({ err: rpcError }, 'record_failed_login RPC unavailable — using legacy increment');
    }
    const now = new Date().toISOString();
    const { data: updated, error: incError } = await supabase
      .from('users')
      .update({
        failed_login_attempts: (existing.failed_login_attempts || 0) + 1,
        last_failed_login: now,
      })
      .eq('id', existing.id)
      .select('failed_login_attempts')
      .single();

    if (incError || !updated) {
      logger.error({ err: incError }, 'Failed to record login attempt');
      throw new LockoutUnavailableError();
    }

    newAttempts = updated.failed_login_attempts || 0;
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      locked = true;
      lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();

      await supabase
        .from('users')
        .update({ locked_until: lockedUntil })
        .eq('id', existing.id);
    }
  }

  if (locked) {
    logSecurityEvent('account_locked', 'high', {
      userId: existing.id,
      email,
      ip,
      userAgent,
      details: `Account locked after ${newAttempts} failed login attempts`,
      metadata: { attempts: newAttempts, lockoutDurationMinutes: LOCKOUT_DURATION_MS / 60000 },
    });
  } else {
    logSecurityEvent('failed_login_attempt', 'low', {
      userId: existing.id,
      email,
      ip,
      userAgent,
      details: `Failed login attempt ${newAttempts}/${MAX_FAILED_ATTEMPTS}`,
    });
  }

  return {
    locked,
    attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - newAttempts),
    lockedUntil,
  };
}

/**
 * Clear failed login attempts on successful login
 */
export async function clearFailedAttempts(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      last_failed_login: null,
    })
    .eq('id', userId);

  if (error) {
    logger.error({ err: error }, 'Failed to clear failed attempts');
  }
}

/**
 * Admin function to manually unlock an account
 */
export async function unlockAccount(userId: string, adminUserId: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      last_failed_login: null,
    })
    .eq('id', userId);

  if (error) {
    logger.error({ err: error }, 'Failed to unlock account');
    return false;
  }

  logSecurityEvent('account_unlocked_admin', 'medium', {
    userId,
    ip: undefined,
    userAgent: undefined,
    details: `Account manually unlocked by admin ${adminUserId}`,
  });

  return true;
}

/**
 * Get lockout status for admin panel
 */
export async function getLockoutStatus(userId: string): Promise<{
  failedAttempts: number;
  lockedUntil: string | null;
  lastFailedLogin: string | null;
  isLocked: boolean;
}> {
  const { data: user, error } = await supabase
    .from('users')
    .select('failed_login_attempts, locked_until, last_failed_login')
    .eq('id', userId)
    .single();

  if (error || !user) {
    return { failedAttempts: 0, lockedUntil: null, lastFailedLogin: null, isLocked: false };
  }

  const isLocked = Boolean(user.locked_until) && new Date(user.locked_until) > new Date();

  return {
    failedAttempts: user.failed_login_attempts || 0,
    lockedUntil: user.locked_until,
    lastFailedLogin: user.last_failed_login,
    isLocked,
  };
}