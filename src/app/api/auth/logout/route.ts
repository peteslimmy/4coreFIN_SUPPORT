import { NextRequest, NextResponse } from 'next/server';
import { requireSession, applySessionCookies } from '../../../../../lib/server/session';
import { audit, AuditAction } from '../../../../../server/auditEvents';

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  await audit({
    event: 'USER_LOGOUT',
    actor: session.user.name,
    role: session.user.role,
    action: AuditAction.USER_LOGOUT,
    details: `User ${session.user.email} logged out`,
  });
  return applySessionCookies(NextResponse.json({ ok: true }), null);
}
