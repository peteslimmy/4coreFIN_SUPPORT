import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listNotifications, insertNotification, getScopedTicket } from '../../../../server/repository';
import { buildId } from '../../../../server/lib/ids';
import { guardRequest } from '../../../../lib/server/apiContext';
import { withIdempotency } from '../../../../lib/server/idempotency';

export async function GET(req: NextRequest) {
  const guard = await guardRequest(req);
  if (guard instanceof NextResponse) return guard;
  const rows = await listNotifications(guard.session.user.email, guard.session.user);
  return NextResponse.json(rows);
}

const bodySchema = z.object({
  ticketId: z.string().min(1),
  message: z.string().min(1),
  recipient: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await guardRequest(req, 'notifications:view');
  if (guard instanceof NextResponse) return guard;
  const user = guard.session.user;

  return withIdempotency(req, async () => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    const n = parsed.data;

    const ticket = await getScopedTicket(n.ticketId, user);
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    const entry = {
      ...n,
      id: buildId('wn'),
      timestamp: new Date().toISOString(),
      recipient: n.recipient || user.email,
      seen: false,
    };
    await insertNotification(entry);
    return NextResponse.json(entry, { status: 201 });
  });
}
