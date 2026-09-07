import { NextRequest, NextResponse } from 'next/server';
import { listAuditLogs } from '../../../../server/repository';
import { guardRequest } from '../../../../lib/server/apiContext';

export async function GET(req: NextRequest) {
  const guard = await guardRequest(req, 'audit:view');
  if (guard instanceof NextResponse) return guard;
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 500, 1000);
  const rows = await listAuditLogs(limit, guard.session.user);
  return NextResponse.json(rows);
}
