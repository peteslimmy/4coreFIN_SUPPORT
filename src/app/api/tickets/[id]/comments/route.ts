import { NextRequest, NextResponse } from 'next/server';
import { listComments } from '../../../../../../server/repository';
import { guardRequest } from '../../../../../../lib/server/apiContext';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardRequest(req, 'comments:view');
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;
  const rows = await listComments([id], guard.session.user);
  return NextResponse.json(rows);
}
