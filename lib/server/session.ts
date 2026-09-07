import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import {
  signToken,
  toAuthUser,
  findUserById,
  type AppUserRow,
  type JwtPayload,
  SESSION_COOKIE,
  CSRF_COOKIE,
} from '../../server/auth';
import type { AuthUser } from '../../server/compliance';

export { SESSION_COOKIE, CSRF_COOKIE };
export const SB_TOKEN_COOKIE = '4c_sb_at';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS || null;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Paths a must-change-password / pending-activation session may still reach. */
const PASSWORD_GATE_ALLOWLIST = [
  '/api/auth/change-password',
  '/api/auth/verify-password',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/reset-password',
];

export interface SessionCookies {
  session: string;
  csrf: string;
  sbAccessToken?: string;
}

export function buildSessionCookies(user: AuthUser, sbAccessToken?: string): SessionCookies {
  return {
    session: signToken(user),
    csrf: crypto.randomBytes(32).toString('hex'),
    sbAccessToken,
  };
}

/** Attach (or clear) session cookies on a NextResponse. */
export function applySessionCookies(
  res: NextResponse,
  cookies: SessionCookies | null
): NextResponse {
  const isDev = process.env.NODE_ENV !== 'production';
  const base = {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: !isDev,
    path: '/',
    maxAge: 12 * 60 * 60,
  };
  if (!cookies) {
    res.cookies.set(SESSION_COOKIE, '', { ...base, maxAge: 0 });
    res.cookies.set(CSRF_COOKIE, '', { ...base, httpOnly: false, maxAge: 0 });
    res.cookies.set(SB_TOKEN_COOKIE, '', { ...base, maxAge: 0 });
    return res;
  }
  res.cookies.set(SESSION_COOKIE, cookies.session, base);
  res.cookies.set(CSRF_COOKIE, cookies.csrf, { ...base, httpOnly: false });
  if (cookies.sbAccessToken) {
    res.cookies.set(SB_TOKEN_COOKIE, cookies.sbAccessToken, base);
  }
  return res;
}

function getCookies(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  const header = req.headers.get('cookie');
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export type AuthResult =
  | { ok: true; user: AuthUser; supabaseAccessToken?: string }
  | { ok: false; status: number; error: string; code?: string };

/**
 * Next.js equivalent of express requireAuth: verifies the session JWT
 * (cookie or bearer), re-reads the user row, enforces tokenVersion
 * invalidation, suspension and the forced-password-change gate.
 */
export async function getSessionUser(req: NextRequest): Promise<AuthResult> {
  const cookies = getCookies(req);
  const bearer = req.headers.get('authorization');
  let token: string | null = null;
  if (bearer?.startsWith('Bearer ')) {
    token = bearer.slice(7);
  } else if (cookies[SESSION_COOKIE]) {
    token = cookies[SESSION_COOKIE];
  }
  if (!token) return { ok: false, status: 401, error: 'Authentication required' };

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    if (JWT_SECRET_PREVIOUS) {
      try {
        decoded = jwt.verify(token, JWT_SECRET_PREVIOUS) as JwtPayload;
      } catch {
        return { ok: false, status: 401, error: 'Invalid or expired token' };
      }
    } else {
      return { ok: false, status: 401, error: 'Invalid or expired token' };
    }
  }

  let row: AppUserRow | undefined;
  try {
    row = await findUserById(decoded.sub);
  } catch {
    return { ok: false, status: 500, error: 'Auth service error' };
  }
  if (!row) return { ok: false, status: 401, error: 'User no longer exists' };

  if (
    decoded.tokenVersion !== undefined &&
    row.token_version != null &&
    decoded.tokenVersion !== row.token_version
  ) {
    return { ok: false, status: 401, error: 'Session invalidated by password change' };
  }

  if (row.is_active === false && !row.activation_token) {
    return { ok: false, status: 401, error: 'Account suspended' };
  }

  const user = toAuthUser(row);
  if (row.must_change_password || row.is_active === false) {
    const path = req.nextUrl.pathname;
    if (!PASSWORD_GATE_ALLOWLIST.some((p) => path === p || path.endsWith(p))) {
      return {
        ok: false,
        status: 403,
        error: 'Password change required before accessing the app',
        code: 'PASSWORD_CHANGE_REQUIRED',
      };
    }
  }

  return { ok: true, user, supabaseAccessToken: cookies[SB_TOKEN_COOKIE] };
}

/** Constant-time string comparison (edge-safe, no Node crypto). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * CSRF defense for state-changing /api requests: double-submit token plus
 * same-origin check. Mirrors server/auth.ts requireCsrf exemptions.
 */
export function validateCsrf(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  if (SAFE_METHODS.has(req.method)) return { ok: true };
  const path = req.nextUrl.pathname.toLowerCase();
  if (
    path.endsWith('/api/auth/login') ||
    path.endsWith('/api/auth/forgot-password') ||
    path.endsWith('/api/auth/reset-password') ||
    path.endsWith('/api/email/webhook')
  ) {
    return { ok: true };
  }
  const cookies = getCookies(req);
  if (!cookies[SESSION_COOKIE]) {
    const referer = req.headers.get('referer');
    if (!referer) return { ok: false, status: 401, error: 'Authentication required' };
    try {
      const { host } = new URL(referer);
      if (host !== (req.headers.get('host') || '')) {
        return { ok: false, status: 403, error: 'Cross-origin request rejected' };
      }
    } catch {
      return { ok: false, status: 403, error: 'Cross-origin request rejected' };
    }
    return { ok: true };
  }
  const csrf = cookies[CSRF_COOKIE];
  const header = req.headers.get('x-csrf-token') || '';
  if (!csrf || !header || !safeEqual(csrf, header)) {
    return { ok: false, status: 403, error: 'Invalid CSRF token' };
  }
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const { host } = new URL(origin);
      if (host !== (req.headers.get('host') || '')) {
        return { ok: false, status: 403, error: 'Cross-origin request rejected' };
      }
    } catch {
      return { ok: false, status: 403, error: 'Cross-origin request rejected' };
    }
  }
  return { ok: true };
}

/** Validate CSRF and return a ready error response, or null when the request is safe. */
export function csrfErrorResponse(req: NextRequest): NextResponse | null {
  const result: { ok: true } | { ok: false; status: number; error: string } = validateCsrf(req);
  if (result.ok === true) return null;
  const failure: { ok: false; status: number; error: string } = result;
  return NextResponse.json({ error: failure.error }, { status: failure.status });
}

export interface SessionContext {
  user: AuthUser;
  supabaseAccessToken?: string;
}

/**
 * Authenticated-request guard for route handlers. Returns a ready-to-return
 * NextResponse error, or the session context. Using a class instance for the
 * failure branch keeps call-site narrowing reliable in non-strict TS builds:
 *   const session = await requireSession(req);
 *   if (session instanceof NextResponse) return session;
 */
export async function requireSession(req: NextRequest): Promise<SessionContext | NextResponse> {
  const auth: AuthResult = await getSessionUser(req);
  if (auth.ok === true) {
    const ctx: SessionContext = { user: auth.user, supabaseAccessToken: auth.supabaseAccessToken };
    return ctx;
  }
  const failure: { ok: false; status: number; error: string; code?: string } = auth;
  const res = NextResponse.json({ error: failure.error, code: failure.code }, { status: failure.status });
  return res;
}

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}
