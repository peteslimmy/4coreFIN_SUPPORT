import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/server/session';

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  return NextResponse.json({
    user: session.user,
    mustChangePassword: Boolean(session.user.mustChangePassword),
  });
}
