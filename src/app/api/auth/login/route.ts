import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  supabaseSignIn,
  findUserByAuthId,
  findUserByEmail,
  toAuthUser,
} from '../../../../../server/auth';
import { applySessionCookies, buildSessionCookies, jsonError } from '../../../../../lib/server/session';
import { rateLimit } from '../../../../../lib/server/rateLimit';
import { audit, AuditAction } from '../../../../../server/auditEvents';

const bodySchema = z.object({
  email: z.string().email().trim(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const retryAfter = rateLimit(req, { windowMs: 15 * 60_000, max: 50, scope: 'login' });
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return jsonError(400, 'Invalid request body');
    body = parsed.data;
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  try {
    const { id: authUserId, accessToken } = await supabaseSignIn(body.email, body.password, ip, userAgent);
    const userRow = (await findUserByAuthId(authUserId)) ?? (await findUserByEmail(body.email));
    if (!userRow) return jsonError(401, 'Account not provisioned in app');

    // Pending-activation accounts may log in to choose their own password;
    // suspended accounts are hard-blocked (mirrors the Express login flow).
    const pendingActivation =
      userRow.is_active === false &&
      (Boolean(userRow.activation_token) || Boolean(userRow.must_change_password));
    if (userRow.is_active === false && !pendingActivation) {
      return jsonError(403, 'Account suspended');
    }

    const authUser = toAuthUser(userRow);
    const cookies = buildSessionCookies(authUser, accessToken);
    await audit({
      event: 'USER_LOGIN',
      actor: userRow.name,
      role: userRow.role,
      action: AuditAction.USER_LOGIN,
      details: `User ${userRow.email} logged in`,
    });
    const res = NextResponse.json({
      user: authUser,
      mustChangePassword: Boolean(authUser.mustChangePassword) || pendingActivation,
      pendingActivation,
    });
    return applySessionCookies(res, cookies);
  } catch (e: any) {
    if (e?.code === 'ACCOUNT_LOCKED') {
      return jsonError(423, 'Account temporarily locked due to too many failed attempts', {
        lockedUntil: e.lockedUntil,
      });
    }
    if (e?.name === 'LockoutUnavailableError' || (Number.isInteger(e?.status) && e.status >= 500)) {
      return jsonError(503, 'Login temporarily unavailable. Please try again shortly.');
    }
    // Uniform error to prevent email enumeration
    return jsonError(401, 'Invalid email or password');
  }
}
