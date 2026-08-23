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
 * Record a failed login attempt
 */
export async function recordFailedLogin(email: string, ip?: string, userAgent?: string): Promise<LockoutResult> {
  const { data: user, error: findError } = await supabase
    .from('users')
    .select('id, failed_login_attempts, locked_until')
    .ilike('email', escapeLike(email))
    .single();

  if (findError || !user) {
    // User not found - still log for security monitoring
    logSecurityEvent('failed_login_unknown_user', 'medium', {
      email,
      ip,
      userAgent,
      details: 'Login attempt for non-existent account',
    });
    return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS };
  }

  // Already locked - don't increment further
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return {
      locked: true,
      attemptsRemaining: 0,
      lockedUntil: user.locked_until,
    };
  }

  const newAttempts = (user.failed_login_attempts || 0) + 1;
  const updates: any = {
    failed_login_attempts: newAttempts,
    last_failed_login: new Date().toISOString(),
  };

  let locked = false;
  let lockedUntil: string | undefined;

  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    locked = true;
    lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
    updates.locked_until = lockedUntil;

    // Log security event for lockout
    logSecurityEvent('account_locked', 'high', {
      userId: user.id,
      email,
      ip,
      userAgent,
      details: `Account locked after ${newAttempts} failed login attempts`,
      metadata: { attempts: newAttempts, lockoutDurationMinutes: LOCKOUT_DURATION_MS / 60000 },
    });

    // TODO: Send lockout notification email
    // await sendLockoutEmail(email);
  } else {
    // Log failed attempt
    logSecurityEvent('failed_login_attempt', 'low', {
      userId: user.id,
      email,
      ip,
      userAgent,
      details: `Failed login attempt ${newAttempts}/${MAX_FAILED_ATTEMPTS}`,
    });
  }

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id);

  if (error) {
    logger.error({ err: error }, "Failed to record login attempt");
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


