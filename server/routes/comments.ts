import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { listComments, insertComment, updateComment, getScopedTicket, getScopedComment } from '../repository';
import { buildId } from '../lib/ids';
import { audit, AuditAction } from '../auditEvents';
import { resolveCommentRecipients, buildCommentEmailHtml, buildCommentEmailText, notifyCommentRecipients } from '../services/commentsService';

export function createCommentsRouter(): Router {
  const router = Router();

  router.get('/tickets/:id/comments', requireAuth, requirePermission('comments:view'), async (req: AuthedRequest, res: Response) => {
    const rows = await listComments([req.params.id], req.user!);
    res.json(rows);
  });

  router.post('/comments', requireAuth, requirePermission('comments:create'), validateBody(z.object({
    ticketId: z.string().min(1),
    message: z.string().min(1),
    isInternal: z.boolean().optional(),
    parentCommentId: z.string().optional(),
    notifyRecipients: z.array(z.string().min(1)).optional(),
  })), async (req: AuthedRequest, res: Response) => {
    const c = req.body;
    const ticket = await getScopedTicket(c.ticketId, req.user!);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const entry = { ...c, id: typeof c.id === 'string' && c.id.trim() ? c.id : buildId('cmt'), timestamp: new Date().toISOString(), author: req.user!.name, authorEmail: req.user!.email, role: req.user!.role, seen: false, seenBy: [] };
    await insertComment(entry);

    const recipients = await resolveCommentRecipients({
      message: entry.message,
      parentCommentId: c.parentCommentId,
      notifyRecipients: c.notifyRecipients,
      currentUserEmail: req.user!.email || '',
      user: req.user!,
    });

    const snippet = String(entry.message || '').slice(0, 120);
    const subject = `[4C] New comment on ${entry.ticketId}`;
    const html = buildCommentEmailHtml({ ticketId: entry.ticketId, author: entry.author, messageSnippet: snippet });
    const text = buildCommentEmailText({ ticketId: entry.ticketId, author: entry.author, messageSnippet: snippet });

    res.status(201).json(entry);

    // Notification fan-out happens after the response is flushed: recipients
    // are independent, so inserts run in parallel instead of N sequential
    // round-trips. Failures never fail the already-delivered comment.
    await notifyCommentRecipients({
      recipients,
      commentId: entry.id,
      ticketId: entry.ticketId,
      author: entry.author,
      snippet,
      currentUserEmail: req.user!.email || '',
      subject,
      html,
      text,
    });
    // Off critical path — see POST /tickets.
    audit({ event: 'COMMENT_ADDED', actor: req.user!.name, role: req.user!.role, action: AuditAction.COMMENT_ADDED, details: `Comment ${entry.id} added to ticket ${c.ticketId}`, ticketId: c.ticketId }).catch(() => {});
  });

  router.patch('/comments/:id', requireAuth, requirePermission('comments:create'), validateBody(z.object({
    message: z.string().min(1).optional(),
    isInternal: z.boolean().optional(),
  })), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedComment(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Comment not found' });
    await updateComment({ ...req.body, id: req.params.id });
    res.json({ ok: true });
    // Off critical path — see POST /comments.
    audit({ event: 'COMMENT_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.COMMENT_UPDATED, details: `Comment ${req.params.id} updated`, ticketId: existing.ticketId }).catch(() => {});
  });

  return router;
}
