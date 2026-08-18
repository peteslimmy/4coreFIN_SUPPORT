import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { listComments, insertComment, updateComment, getScopedTicket, getScopedComment, insertNotification, listUsersPublic } from '../repository';
import { buildId } from '../lib/ids';
import { audit, AuditAction } from '../auditEvents';
import { notifyByEmail, appHomeUrl } from '../services/notifyEmails';

/** A sender's email is authoritative — never trust a client-supplied address. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

/** Resolve @Name tokens in a comment to matching user emails (best-effort). */
function mentionEmails(message: string, users: Array<{ name?: string; email: string }>): string[] {
  const tokens: string[] = [];
  const re = /@([A-Za-z0-9][A-Za-z0-9.'-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.'-]*)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) tokens.push(m[1].trim());
  const out: string[] = [];
  for (const token of tokens) {
    const tl = token.toLowerCase();
    const hit = users.find((u) => {
      const n = (u.name || '').toLowerCase();
      return n === tl || n.startsWith(tl + ' ') || n.split(/\s+/)[0] === tl;
    });
    if (hit && !out.includes(hit.email)) out.push(hit.email);
  }
  return out;
}

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
    await audit({ event: 'COMMENT_ADDED', actor: req.user!.name, role: req.user!.role, action: AuditAction.COMMENT_ADDED, details: `Comment ${entry.id} added to ticket ${c.ticketId}`, ticketId: c.ticketId });

    // Who should hear about this comment: the author of the comment being
    // replied to, @mention targets in the message, and any explicit addresses.
    const recipients = new Set<string>();
    if (c.parentCommentId) {
      const parent = await getScopedComment(c.parentCommentId, req.user!);
      if (parent?.authorEmail) {
        recipients.add(parent.authorEmail);
      } else if (parent?.author) {
        try {
          const users = await listUsersPublic();
          const byName = users.find((u) => u.name?.toLowerCase() === String(parent.author).toLowerCase());
          if (byName?.email) recipients.add(byName.email);
        } catch {
          // legacy rows without an author address are best-effort
        }
      }
    }
    try {
      const users = await listUsersPublic();
      for (const email of mentionEmails(entry.message, users)) recipients.add(email);
    } catch {
      // mention resolution must never block the comment from being delivered
    }
    for (const r of Array.isArray(c.notifyRecipients) ? c.notifyRecipients : []) {
      if (typeof r === 'string' && r.trim()) recipients.add(r.trim());
    }

    const snippet = String(entry.message || '').slice(0, 120);
    const subject = `[4C] New comment on ${entry.ticketId}`;
    const html = `<h3>New comment on ${entry.ticketId}</h3><p><strong>From:</strong> ${escapeHtml(entry.author)}</p><blockquote style="border-left:3px solid #e2e8f0;padding-left:12px;color:#334155;">${escapeHtml(snippet)}</blockquote><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`;
    const text = `New comment from ${entry.author} on ${entry.ticketId}: ${snippet}`;

    let idx = 0;
    for (const recipient of recipients) {
      if (recipient.toLowerCase() === (req.user!.email || '').toLowerCase()) continue;
      try {
        await insertNotification({
          id: `wn-cmt-${entry.id}-${idx}`,
          timestamp: new Date().toISOString(),
          ticketId: entry.ticketId,
          message: `New comment from ${entry.author} on ${entry.ticketId}: “${snippet}”`,
          recipient,
          seen: false,
        });
      } catch {
        // a notifications hiccup must not fail the comment write
      }
      void notifyByEmail(recipient, subject, html, text);
      idx++;
    }

    res.status(201).json(entry);
  });

  router.patch('/comments/:id', requireAuth, requirePermission('comments:create'), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedComment(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Comment not found' });
    const c = req.body;
    await updateComment({ ...c, id: req.params.id });
    await audit({ event: 'COMMENT_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.COMMENT_UPDATED, details: `Comment ${req.params.id} updated`, ticketId: existing.ticketId });
    res.json({ ok: true });
  });

  return router;
}
