import { NextRequest, NextResponse } from 'next/server';
import { listUsersPublic } from '../../../../server/repository';
import { guardRequest } from '../../../../lib/server/apiContext';

export async function GET(req: NextRequest) {
  const guard = await guardRequest(req, 'admin:users');
  if (guard instanceof NextResponse) return guard;
  const users = await listUsersPublic();
  return NextResponse.json(users);
}
