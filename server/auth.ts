import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { supabase, supabaseAuth } from './supabase';
import { logger, logSecurityEvent } from './logger';
import type { AuthUser } from './compliance';
import { isBuSupportRole, isGlobalRole } from './rbac';
import { tenantIdForBu } from './tenant';
import { isAccountLocked, recordFailedLogin, clearFailedAttempts } from './services/lockoutService';
import { getCachedUserRow, setUserRowCache } from './lib/userCache';
import { escapeLike } from './lib/escapeLike';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS || null;
const TOKEN_TTL = process.env.JWT_TTL || '12h';

/**
 * Auth provider switch. Every login, in every environment, goes through Supabase
 * Auth (signInWithPassword). The app never accepts a locally-hashed password for
 * authentication; bcrypt remains only as a password-hash carrier for the local
 * `users.password_hash` column used by profile flows, and is never the source of
 * truth for an authentication decision.
 */
export function authProvider(): 'supabase' {
  return 'supabase';
}

export function isSupabaseAuth(): boolean {
  return true;
}

export const SESSION_COOKIE = '4c_session';
export const CSRF_COOKIE = '4c_csrf';

export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try { out[name] = decodeURIComponent(value); } catch { out[name] = value; }
  }
  return out;
}

function sessionCookieOptions(isDev: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: !isDev,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  };
}

/** Issue the httpOnly session cookie plus a JS-readable CSRF cookie. */
export function issueSession(res: Response, user: AuthUser): void {
  const token = signToken(user);
  const isDev = process.env.NODE_ENV !== 'production';
  const opts = sessionCookieOptions(isDev);
  res.cookie(SESSION_COOKIE, token, opts);
  res.cookie(CSRF_COOKIE, crypto.randomBytes(32).toString('hex'), {
    ...opts,
    httpOnly: false,
  });
  logger.info({ userId: user.id, email: user.email, role: user.role, cookieMaxAge: opts.maxAge }, 'Session cookie issued');
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense for state-changing requests:
 * double-submit token (header must match the JS-readable cookie) plus a
 * same-origin check. Login/forgot-password/reset-password are exempt because
 * no session exists yet (requireAuth would reject them regardless).
 */
export function requireCsrf(req: AuthedRequest, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const path = (req.path || '').toLowerCase();
  if (
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/forgot-password') ||
    path.startsWith('/auth/reset-password') ||
    // Machine-to-machine endpoint: authenticates via the X-Webhook-Secret
    // shared secret, not browser sessions, and external mail providers send
    // neither cookies nor Referer.
    path.startsWith('/email/webhook')
  ) {
    return next();
  }
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies[SESSION_COOKIE]) {
    // No session cookie — verify same-origin via Referer to prevent CSRF.
    // A request with neither cookie nor Referer has no verifiable origin:
    // fail closed rather than wave it through to Bearer-token handlers.
    // Report 401 (not 403) — without a session there are no ambient
    // credentials to forge, so this is an authentication failure.
    const referer = (req.headers.referer || req.headers.referrer) as string | undefined;
    if (!referer || typeof referer !== 'string') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const { host } = new URL(referer);
      if (host !== (req.get('host') || '')) {
        return res.status(403).json({ error: 'Cross-origin request rejected' });
      }
    } catch {
      return res.status(403).json({ error: 'Cross-origin request rejected' });
    }
    return next();
  }
  const csrf = cookies[CSRF_COOKIE];
  const header = req.headers['x-csrf-token'];
  const headerStr = header ? String(header) : '';
  if (
    !csrf ||
    !header ||
    csrf.length !== headerStr.length ||
    !crypto.timingSafeEqual(Buffer.from(csrf), Buffer.from(headerStr))
  ) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      const { host } = new URL(origin);
      if (host !== (req.get('host') || '')) {
        return res.status(403).json({ error: 'Cross-origin request rejected' });
      }
    } catch {
      return res.status(403).json({ error: 'Cross-origin request rejected' });
    }
  }
  next();
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  bu: string;
  name: string;
  tenantId: string;
  tokenVersion: number;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

/** Async variant for request-path writes — keeps the event loop free during
 *  the ~100ms bcrypt cost. Sync version retained for seeds/tests. */
export async function hashPasswordAsync(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

/** Async verify for request-path checks (login / local password verification). */
export async function verifyPasswordAsync(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Verify local password with lockout check
 */
export async function verifyLocalPassword(
  email: string,
  password: string,
  hash: string,
  ip?: string,
  userAgent?: string
): Promise<boolean> {
  // Check for account lockout first
  const lockoutStatus = await isAccountLocked(email);
  if (lockoutStatus.locked) {
    const err = new Error('Account temporarily locked due to too many failed attempts');
    (err as any).code = 'ACCOUNT_LOCKED';
    (err as any).lockedUntil = lockoutStatus.lockedUntil;
    logSecurityEvent('ACCOUNT_LOCKED_ATTEMPT', 'high', {
      email,
      ip,
      userAgent,
      details: `Login attempt on locked account, locked until ${lockoutStatus.lockedUntil}`,
    });
    throw err;
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    await recordFailedLogin(email, ip, userAgent);
    return false;
  }

  // Successful login - clear failed attempts
  const localUser = await findUserByEmail(email);
  if (localUser) {
    await clearFailedAttempts(localUser.id);
  }

  return true;
}

export function signToken(user: AuthUser): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    bu: user.bu,
    name: user.name,
    tenantId: user.tenantId || tenantIdForBu(user.bu),
    tokenVersion: user.tokenVersion ?? 0,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL } as jwt.SignOptions);
}

/** Full app-users row shape (select('*')). */
export type AppUserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  bu: string;
  partner?: string | null;
  partner_org_id?: number | null;
  phone: string;
  tenant_id?: string;
  auth_user_id?: string | null;
  is_active?: boolean | null;
  isActive?: boolean;
  activation_token?: string | null;
  activated_at?: string | null;
  must_change_password?: boolean | null;
  token_version?: number | null;
};

export async function findUserByEmail(email: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', escapeLike(email))
    .single();
  if (error || !data) return undefined;
  return data as AppUserRow;
}

export async function findUserByAuthId(authUserId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error || !data) return undefined;
  return data as AppUserRow;
}

export async function findUserById(id: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return undefined;
  return data as AppUserRow;
}

/**
 * Verify a password against Supabase Auth. Returns the Supabase user id on
 * success, or throws an AuthError with a safe message.
 */
export async function supabaseSignIn(
  email: string,
  password: string,
  ip?: string,
  userAgent?: string
): Promise<{ id: string; email: string }> {
  // Check for account lockout first
  const lockoutStatus = await isAccountLocked(email);
  if (lockoutStatus.locked) {
    const err = new Error('Account temporarily locked due to too many failed attempts');
    (err as any).code = 'ACCOUNT_LOCKED';
    (err as any).lockedUntil = lockoutStatus.lockedUntil;
    throw err;
  }

  // Verify against Supabase Auth using the dedicated anon-key client. This must
  // NOT use the shared service client: signInWithPassword would persist the user
  // session on it, causing every later data query to run under the user's role
  // (RLS) and silently return zero rows.
  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // Record failed attempt
    await recordFailedLogin(email, ip, userAgent);

    const err: any = error;
    const msg = err?.message || '';
    if (/invalid login credentials|invalidcredentials/i.test(msg)) {
      throw new Error('Invalid credentials');
    }
    if (/email not confirmed|unconfirmed/i.test(msg)) {
      throw new Error('Email not confirmed. Check your inbox and confirm before logging in.');
    }
    throw new Error('Login failed');
  }

  // Successful login - clear failed attempts
  // Note: We need to find the local user to clear their attempts
  const localUser = await findUserByEmail(email);
  if (localUser) {
    await clearFailedAttempts(localUser.id);
  }

  return { id: data.user.id, email: data.user.email || email };
}

/**
 * Create a Supabase Auth identity for self-registration. Uses the admin API so
 * the account is immediately usable (mirrors the current local flow).
 */
export async function supabaseCreateUser(
  email: string,
  password: string,
  name: string
): Promise<{ id: string; email: string }> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) {
    const err: any = error;
    const msg = err?.message || '';
    if (/already registered|already been registered|exists/i.test(msg)) {
      throw new Error('Email already registered');
    }
    throw new Error('Registration failed');
  }
  return { id: data.user.id, email: data.user.email || email };
}

/**
 * Update a Supabase Auth identity's email and/or password. Used when admins
 * provision or edit users in Supabase Auth mode so their credentials stay in
 * sync with the app user row.
 */
export async function supabaseUpdateUser(
  authUserId: string,
  opts: { email?: string; password?: string; name?: string }
): Promise<void> {
  const update: any = {};
  if (opts.email) update.email = opts.email;
  if (opts.password) update.password = opts.password;
  if (opts.name) update.user_metadata = { full_name: opts.name };
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.auth.admin.updateUserById(authUserId, update);
  if (error) {
    const err: any = error;
    const msg = err?.message || '';
    if (/already registered|already been registered|exists/i.test(msg)) {
      throw new Error('Email already registered');
    }
    throw new Error('Failed to update Supabase Auth identity');
  }
}

/** Ban or unban a Supabase Auth identity.

    Called alongside the app-level activation toggle so that:
    - On suspend: the GoTrue identity is also banned (credential logins blocked).
    - On reactivate: the ban is cleared.

    This is a best-effort sync. If the admin call fails, the app-level
    is_active gate still protects the account, so we warn and continue. */
export async function supabaseSetBan(authUserId: string, isActive: boolean): Promise<void> {
  if (!authUserId) return;
  const banDuration = isActive ? 'none' : '876000h';
  const { error } = await supabase.auth.admin.updateUserById(authUserId, { ban_duration: banDuration });
  if (error) {
    logger.warn({ err: error, authUserId, banDuration }, 'Failed to sync suspension with Supabase Auth; app-level gate still active');
  }
}

/** Delete a Supabase Auth identity. */
export async function supabaseDeleteUser(authUserId: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(authUserId);
  if (error) {
    throw new Error('Failed to delete Supabase Auth identity');
  }
}

export function toAuthUser(row: {
  id: string;
  name: string;
  email: string;
  role: string;
  bu: string;
  partner?: string;
  partner_org_id?: number | null;
  account_type?: string;
  phone?: string;
  tenantId?: string;
  tenant_id?: string;
  must_change_password?: boolean | null;
  token_version?: number | null;
}): AuthUser {
  return {
    id: row.id,
    sub: row.id, // JWT subject claim
    name: row.name,
    email: row.email,
    role: row.role,
    bu: row.bu,
    partner: row.partner || '',
    partnerOrgId: row.partner_org_id ?? undefined,
    accountType: row.account_type || (row.role === 'PARTNER' ? 'PARTNER' : 'BU'),
    phone: row.phone || '',
    tenantId: row.tenantId || row.tenant_id || tenantIdForBu(row.bu),
    mustChangePassword: Boolean(row.must_change_password),
    tokenVersion: row.token_version ?? 0,
  };
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const fromCookie = cookies[SESSION_COOKIE];
  const header = req.headers.authorization;
  let token: string | null = null;
  if (header?.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (fromCookie) {
    token = fromCookie;
  }
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    // If current secret fails and a previous secret is configured, try it.
    // This allows a grace period during JWT secret rotation.
    if (JWT_SECRET_PREVIOUS) {
      try {
        decoded = jwt.verify(token, JWT_SECRET_PREVIOUS) as JwtPayload;
      } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } else {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
  // The JWT `sub` is the app-level user id (e.g. "usr-..."). Look it up by `id`
  // only. A previous query used `.or(id.eq.sub, auth_user_id.eq.sub)`, but
  // `auth_user_id` is UUID-typed, so Postgres rejected `auth_user_id.eq.<usr-...>`
  // with "invalid input syntax for type uuid" and every request 401'd (which
  // silently logged the user out). `users.id` accepts the app id directly.
  try {
    // Short-TTL cache: repeated requests from the same session skip the
    // per-request users-table round-trip. Token-version mismatch below still
    // enforces password-change invalidation against the cached row.
    let row: AppUserRow | null = getCachedUserRow(supabase, decoded.sub);
    if (!row) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', decoded.sub)
        .single();
      if (error || !data) {
        return res.status(401).json({ error: 'User no longer exists' });
      }
      row = data as AppUserRow;
      setUserRowCache(supabase, decoded.sub, row);
    }
    req.user = toAuthUser(row);
    // Reject tokens whose embedded tokenVersion doesn't match the DB row.
    // This invalidates all sessions when a password is changed.
    if (decoded.tokenVersion !== undefined && row.token_version != null && decoded.tokenVersion !== row.token_version) {
      clearSession(res);
      return res.status(401).json({ error: 'Session invalidated by password change' });
    }
    if (row.is_active === false) {
      // Pending-activation accounts (still carrying an activation token) may
      // reach the password-change endpoints so the user can set their own
      // password. Suspended accounts have no token and are hard-blocked.
      const pendingActivation = Boolean(row.activation_token);
      if (!pendingActivation) {
        clearSession(res);
        return res.status(401).json({ error: 'Account suspended' });
      }
    }
    // Server-side gate: a freshly-provisioned user whose password was set by
    // an administrator must choose their own password before using the app.
    // Only the password-change endpoint, /auth/me and logout remain reachable.
    if (row.must_change_password || row.is_active === false) {
      const p = (req.originalUrl || req.path || '').toLowerCase();
      // Strip the query string before matching: originalUrl can carry
      // "?next=/auth/change-password" style params that would defeat
      // suffix checks otherwise.
      const cleanPath = p.split('?')[0];
      const allowed =
        cleanPath.endsWith('/auth/change-password') ||
        cleanPath.endsWith('/auth/verify-password') ||
        cleanPath.endsWith('/auth/me') ||
        cleanPath.endsWith('/auth/logout') ||
        cleanPath.endsWith('/auth/reset-password');
      if (!allowed) {
        return res.status(403).json({ error: 'Password change required before accessing the app', code: 'PASSWORD_CHANGE_REQUIRED' });
      }
    }
    next();
  } catch (err) {
    logger.error({ err }, 'requireAuth Supabase error');
    return res.status(500).json({ error: 'Auth service error' });
  }
}

export function requireRoles(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires one of roles: ${roles.join(', ')}` });
    }
    next();
  };
}

/** Scope tickets by tenant/partner for the authenticated user. */
export { canAccessTicket } from '../src/lib/canAccessTicket';

