import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { listComments, insertComment, updateComment, getScopedTicket, getScopedComment } from '../repository';
import { buildId } from '../lib/ids';

export function createCommentsRouter(): Router {
  const router = Router();

  router.get('/tickets/:id/comments', requireAuth, requirePermission('comments:view'), async (req: AuthedRequest, res: Response) => {
    const rows = await listComments([req.params.id], req.user!);
    res.json(rows);
  });

  router.post('/comments', requireAuth, requirePermission('comments:create'), validateBody(z.object({ ticketId: z.string().min(1), message: z.string().min(1), isInternal: z.boolean().optional(), parentCommentId: z.string().optional() })), async (req: AuthedRequest, res: Response) => {
    const c = req.body;
    const ticket = await getScopedTicket(c.ticketId, req.user!);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const entry = { ...c, id: typeof c.id === 'string' && c.id.trim() ? c.id : buildId('cmt'), timestamp: new Date().toISOString(), author: req.user!.name, role: req.user!.role, seen: false, seenBy: [] };
    await insertComment(entry);
    res.status(201).json(entry);
  });

  router.patch('/comments/:id', requireAuth, requirePermission('comments:create'), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedComment(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Comment not found' });
    const c = req.body;
    await updateComment({ ...c, id: req.params.id });
    res.json({ ok: true });
  });

  return router;
}
