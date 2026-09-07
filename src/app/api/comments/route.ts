import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getScopedTicket, insertComment } from '../../../../server/repository';
import { buildId } from '../../../../server/lib/ids';
import { audit, AuditAction } from '../../../../server/auditEvents';
import {
  resolveCommentRecipients,
  buildCommentEmailHtml,
  buildCommentEmailText,
  notifyCommentRecipients,
} from '../../../../server/services/commentsService';
import { guardRequest } from '../../../../lib/server/apiContext';
import { withIdempotency } from '../../../../lib/server/idempotency';

const bodySchema = z.object({
  ticketId: z.string().min(1),
  message: z.string().min(1),
  isInternal: z.boolean().optional(),
  parentCommentId: z.string().optional(),
  notifyRecipients: z.array(z.string().min(1)).optional(),
});

export async function POST(req: NextRequest) {
  const guard = await guardRequest(req, 'comments:create');
  if (guard instanceof NextResponse) return guard;
  const user = guard.session.user;

  return withIdempotency(req, async () => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    const c = parsed.data;

    const ticket = await getScopedTicket(c.ticketId, user);
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    const entry = {
      ...c,
      id: buildId('cmt'),
      timestamp: new Date().toISOString(),
      author: user.name,
      authorEmail: user.email,
      role: user.role,
      seen: false,
      seenBy: [] as string[],
    };
    await insertComment(entry);

    const recipients = await resolveCommentRecipients({
      message: entry.message,
      parentCommentId: c.parentCommentId,
      notifyRecipients: c.notifyRecipients,
      currentUserEmail: user.email || '',
      user,
    });

    const snippet = String(entry.message || '').slice(0, 120);
    const subject = `[4C] New comment on ${entry.ticketId}`;
    const html = buildCommentEmailHtml({ ticketId: entry.ticketId, author: entry.author, messageSnippet: snippet });
    const text = buildCommentEmailText({ ticketId: entry.ticketId, author: entry.author, messageSnippet: snippet });

    // Notification fan-out after the response is flushed; failures never fail
    // the already-delivered comment.
    void notifyCommentRecipients({
      recipients,
      commentId: entry.id,
      ticketId: entry.ticketId,
      author: entry.author,
      snippet,
      currentUserEmail: user.email || '',
      subject,
      html,
      text,
    }).catch(() => {});

    audit({ event: 'COMMENT_ADDED', actor: user.name, role: user.role, action: AuditAction.COMMENT_ADDED, details: `Comment ${entry.id} added to ticket ${c.ticketId}`, ticketId: c.ticketId }).catch(() => {});
    return NextResponse.json(entry, { status: 201 });
  });
}
