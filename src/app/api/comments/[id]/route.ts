import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getScopedComment, updateComment } from '../../../../../server/repository';
import { audit, AuditAction } from '../../../../../server/auditEvents';
import { guardRequest } from '../../../../../lib/server/apiContext';

const bodySchema = z.object({
  message: z.string().min(1).optional(),
  isInternal: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardRequest(req, 'comments:create');
  if (guard instanceof NextResponse) return guard;
  const user = guard.session.user;
  const { id } = await ctx.params;

  const existing = await getScopedComment(id, user);
  if (!existing) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  await updateComment({ ...parsed.data, id });
  audit({ event: 'COMMENT_UPDATED', actor: user.name, role: user.role, action: AuditAction.COMMENT_UPDATED, details: `Comment ${id} updated`, ticketId: existing.ticketId }).catch(() => {});
  return NextResponse.json({ ok: true });
}
