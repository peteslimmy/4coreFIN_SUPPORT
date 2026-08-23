import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { appendAuditLog, listAuditLogs, verifyAuditChainPaged } from '../repository';
import { AuditAction } from '../auditCatalog';

export function createAuditRouter(): Router {
  const router = Router();

  router.get('/audit-log', requireAuth, requirePermission('audit:view'), async (req: AuthedRequest, res: Response) => {
    const limit = req.query.limit ? Math.min(Number(req.query.limit) || 500, 1000) : 500;
    const logs = await listAuditLogs(limit, req.user!);
    res.json(logs);
  });

  router.post('/audit-log', requireAuth, requirePermission('audit:write'), validateBody(z.object({ ticketId: z.string().nullable().optional(), action: z.string().min(1), event: z.string().min(1).optional(), details: z.string().min(1) })), async (req: AuthedRequest, res: Response) => {
    const { ticketId, action, event, details } = req.body as { ticketId?: string | null; action: string; event?: string; details: string };
    const entry = await appendAuditLog({
      ticketId: ticketId || null,
      actor: req.user!.name,
      role: req.user!.role,
      action,
      event: event ?? null,
      details,
    });
    res.status(201).json(entry);
  });

  router.get('/audit-log/verify', requireAuth, requirePermission('audit:verify'), async (_req: AuthedRequest, res: Response) => {
    // The ledger is globally linked, so verification requires the full chain in
    // chronological (oldest-first) order — streamed in pages to keep memory
    // flat regardless of ledger size.
    const result = await verifyAuditChainPaged();
    res.json(result);
  });

  return router;
}
