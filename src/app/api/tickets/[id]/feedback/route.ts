import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getScopedTicket, upsertTicket } from '../../../../../../server/repository';
import { hasPermissionForRoleId, getRoles } from '../../../../../../shared/rbac';
import { getConfig } from '../../../../../../server/repository';
import { audit, AuditAction } from '../../../../../../server/auditEvents';
import { guardRequest } from '../../../../../../lib/server/apiContext';
import { TicketStatus } from '../../../../../../src/types/app';

const schema = z.object({
  feedbackScore: z.number().int().min(1).max(5).nullable().optional(),
  feedbackComment: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardRequest(req, 'tickets:view');
  if (guard instanceof NextResponse) return guard;
  const user = guard.session.user;
  const { id } = await ctx.params;

  const existing = await getScopedTicket(id, user);
  if (!existing) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

  const canEdit = hasPermissionForRoleId(
    getRoles(await getConfig('roles', [])), user.role, 'tickets:edit'
  );
  const isOwnBu = user.role === 'CUSTOMER' && existing.businessUnit === user.bu;
  if (!canEdit && !isOwnBu) {
    return NextResponse.json({ error: 'Feedback can only be submitted on your own business unit tickets' }, { status: 403 });
  }

  // Feedback is only meaningful once a decision has been made.
  if (existing.status !== TicketStatus.RESOLVED && existing.status !== TicketStatus.CLOSED) {
    return NextResponse.json({ error: 'Feedback can only be submitted on resolved or closed tickets' }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const body = parsed.data;

  const updated = {
    ...existing,
    feedbackScore: body.feedbackScore !== undefined ? body.feedbackScore : existing.feedbackScore,
    feedbackComment: body.feedbackComment !== undefined ? body.feedbackComment : existing.feedbackComment,
  };
  // Audit fix: optimistic concurrency on feedback writes.
  try {
    await upsertTicket(updated, {
      expectedVersion: typeof (existing as any).version === 'number' ? (existing as any).version : undefined,
    });
  } catch (e: any) {
    if (e?.code === 'CONCURRENT_MODIFICATION') {
      return NextResponse.json({ error: 'Ticket was modified by another user. Reload and retry.', code: 'CONCURRENT_MODIFICATION' }, { status: 409 });
    }
    throw e;
  }
  audit({ event: 'TICKET_FEEDBACK', ticketId: id, actor: user.name, role: user.role, action: AuditAction.TICKET_FEEDBACK, details: `Feedback submitted for ticket ${id}` }).catch(() => {});
  return NextResponse.json(updated);
}
