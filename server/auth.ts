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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
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
    path.startsWith('/auth/reset-password')
  ) {
    return next();
  }
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies[SESSION_COOKIE]) return next();
  const csrf = cookies[CSRF_COOKIE];
  const header = req.headers['x-csrf-token'];
  if (!csrf || !header || csrf !== String(header)) {
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
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
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

  const valid = bcrypt.compareSync(password, hash);
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
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL } as jwt.SignOptions);
}

export async function findUserByEmail(email: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', email)
    .single();
  if (error || !data) return undefined;
  return data as {
id: string;
    name: string;
    email: string;
    password_hash: string;
    role: string;
    bu: string;
    phone: string;
    tenant_id?: string;
    auth_user_id?: string | null;
    is_active?: boolean | null;
    isActive?: boolean;
    activation_token?: string | null;
    activated_at?: string | null;
  };
}

export async function findUserByAuthId(authUserId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error || !data) return undefined;
  return data as {
id: string;
    name: string;
    email: string;
    password_hash: string;
    role: string;
    bu: string;
    phone: string;
    tenant_id?: string;
    auth_user_id?: string | null;
    is_active?: boolean | null;
    isActive?: boolean;
    activation_token?: string | null;
    activated_at?: string | null;
  };
}

export async function findUserById(id: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return undefined;
  return data as {
id: string;
    name: string;
    email: string;
    password_hash: string;
    role: string;
    bu: string;
    phone: string;
    tenant_id?: string;
    auth_user_id?: string | null;
    is_active?: boolean | null;
    isActive?: boolean;
    activation_token?: string | null;
    activated_at?: string | null;
  };
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
  account_type?: string;
  phone?: string;
  tenantId?: string;
  tenant_id?: string;
  must_change_password?: boolean | null;
}): AuthUser {
  return {
    id: row.id,
    sub: row.id, // JWT subject claim
    name: row.name,
    email: row.email,
    role: row.role,
    bu: row.bu,
    partner: row.partner || '',
    accountType: row.account_type || (row.role === 'PARTNER' ? 'PARTNER' : 'BU'),
    phone: row.phone || '',
    tenantId: row.tenantId || row.tenant_id || tenantIdForBu(row.bu),
    mustChangePassword: Boolean(row.must_change_password),
  };
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
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
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    // The JWT `sub` is the app-level user id (e.g. "usr-..."). Look it up by `id`
    // only. A previous query used `.or(id.eq.sub, auth_user_id.eq.sub)`, but
    // `auth_user_id` is UUID-typed, so Postgres rejected `auth_user_id.eq.<usr-...>`
    // with "invalid input syntax for type uuid" and every request 401'd (which
    // silently logged the user out). `users.id` accepts the app id directly.
    Promise.resolve(
      supabase.from('users').select('*').eq('id', decoded.sub).single()
    ).then(({ data: row, error }) => {
        if (error || !row) {
          return res.status(401).json({ error: 'User no longer exists' });
        }
        req.user = toAuthUser(row);
        // Server-side gate: a freshly-provisioned user whose password was set by
        // an administrator must choose their own password before using the app.
        // Only the password-change endpoint, /auth/me and logout remain reachable.
        if (row.must_change_password) {
          const p = (req.originalUrl || req.path || '').toLowerCase();
          const allowed =
            p.includes('/auth/change-password') ||
            p.includes('/auth/verify-password') ||
            p.endsWith('/auth/me') ||
            p.endsWith('/auth/logout');
          if (!allowed) {
            return res.status(403).json({ error: 'Password change required before accessing the app', code: 'PASSWORD_CHANGE_REQUIRED' });
          }
        }
        next();
      }).catch((err) => {
        logger.error({ err }, "requireAuth Supabase error");
        return res.status(500).json({ error: 'Auth service error' });
      });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
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
export function canAccessTicket(
  user: AuthUser,
  ticket: { businessUnit?: string; business_unit?: string; partner?: string; provider?: string; assignedAgentId?: string }
): boolean {
  if (isGlobalRole(user.role)) return true;
  const bu = (ticket.businessUnit || ticket.business_unit || '').toLowerCase();
  if (user.role === 'CUSTOMER') {
    const myBu = user.bu.toLowerCase();
    return myBu === 'all' || bu === myBu;
  }
  if (isBuSupportRole(user.role)) {
    const myBu = user.bu.toLowerCase();
    return myBu === 'all' || bu === myBu;
  }
  if (user.role === 'PARTNER') {
    const partner = (ticket.partner || ticket.provider || '').toLowerCase();
    const mine = (user.partner || user.bu || '').toLowerCase();
    const agent = (ticket.assignedAgentId || '').toLowerCase();
    return (
      partner === mine ||
      agent === mine ||
      agent.startsWith(mine + ' ')
    );
  }
  return false;
}

