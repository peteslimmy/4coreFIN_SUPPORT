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
 * Check if account is currently locked
 */
export async function isAccountLocked(email: string): Promise<LockoutResult> {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, failed_login_attempts, locked_until, last_failed_login')
    .ilike('email', escapeLike(email))
    .single();

  if (error || !user) {
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
 * Record a failed login attempt using an atomic increment to prevent TOCTOU
 * races under concurrent login attempts.
 */
export async function recordFailedLogin(email: string, ip?: string, userAgent?: string): Promise<LockoutResult> {
  // First check if already locked (fast path — no write)
  const { data: existing, error: findError } = await supabase
    .from('users')
    .select('id, failed_login_attempts, locked_until')
    .ilike('email', escapeLike(email))
    .single();

  if (findError || !existing) {
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

  // Atomic increment: UPDATE ... SET failed_login_attempts = failed_login_attempts + 1
  // This prevents two concurrent requests from both reading N and writing N+1,
  // which would skip the lock threshold.
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
    logger.error({ err: incError }, "Failed to record login attempt");
    return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS };
  }

  const newAttempts = updated.failed_login_attempts || 0;
  let locked = false;
  let lockedUntil: string | undefined;

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    locked = true;
    lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();

    await supabase
      .from('users')
      .update({ locked_until: lockedUntil })
      .eq('id', existing.id);

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
    logger.error({ err: error }, "Failed to clear failed attempts");
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
    logger.error({ err: error }, "Failed to unlock account");
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

  const isLocked = user.locked_until && new Date(user.locked_until) > new Date();

  return {
    failedAttempts: user.failed_login_attempts || 0,
    lockedUntil: user.locked_until,
    lastFailedLogin: user.last_failed_login,
    isLocked,
  };
}


