import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { audit, AuditAction } from '../auditEvents';

const TBL = (name: string) => `ticket.${name}` as any;

const createCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  displayOrder: z.number().int().optional().default(0),
});

const createSeveritySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().optional().default(0),
});

export function createTicketReferenceRouter(): Router {
  const router = Router();

  // ── Categories ───────────────────────────────────────────────

  router.get('/ticket/categories', requireAuth,
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('categories')).select('*').order('display_order');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.post('/ticket/categories', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createCategorySchema),
    async (req: AuthedRequest, res: Response) => {
      const entry = { id: crypto.randomUUID(), ...req.body };
      const { error } = await supabase.from(TBL('categories')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'TICKET_CATEGORY_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Category ${entry.code} created` });
      res.status(201).json(entry);
    }
  );

  router.patch('/ticket/categories/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TBL('categories')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'Category not found' });
      const { error } = await supabase.from(TBL('categories')).update(req.body).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'TICKET_CATEGORY_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Category ${req.params.id} updated` });
      res.json({ ok: true });
    }
  );

  // ── Severities ───────────────────────────────────────────────

  router.get('/ticket/severities', requireAuth,
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('severities')).select('*').order('sort_order');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.post('/ticket/severities', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createSeveritySchema),
    async (req: AuthedRequest, res: Response) => {
      const entry = { id: crypto.randomUUID(), ...req.body };
      const { error } = await supabase.from(TBL('severities')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'TICKET_SEVERITY_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Severity ${entry.code} created` });
      res.status(201).json(entry);
    }
  );

  router.patch('/ticket/severities/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TBL('severities')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'Severity not found' });
      const { error } = await supabase.from(TBL('severities')).update(req.body).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'TICKET_SEVERITY_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Severity ${req.params.id} updated` });
      res.json({ ok: true });
    }
  );

  // ── States (read-only) ───────────────────────────────────────

  router.get('/ticket/states', requireAuth,
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('states')).select('*').order('code');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  return router;
}
