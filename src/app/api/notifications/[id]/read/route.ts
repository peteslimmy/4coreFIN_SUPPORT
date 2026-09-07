import { NextRequest, NextResponse } from 'next/server';
import { markNotificationRead } from '../../../../../../server/repository';
import { guardRequest } from '../../../../../../lib/server/apiContext';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardRequest(req);
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;
  await markNotificationRead(id, guard.session.user);
  return NextResponse.json({ ok: true });
}
