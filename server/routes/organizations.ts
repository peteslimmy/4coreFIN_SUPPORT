import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { audit, AuditAction } from '../auditEvents';
import { buildId } from '../lib/ids';

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const createBuSchema = z.object({
  // Matches the DB check constraint (migration 054): real BU codes are exactly 3 uppercase letters
  buid: z.string().regex(/^[A-Z]{3}$/),
  name: z.string().min(1).max(200),
  tenantId: z.string().min(1),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

const updateBuSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const createPartnerSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

const updatePartnerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const linkBuSchema = z.object({
  paymentPartnerId: z.string().uuid(),
  businessUnitId: z.string().uuid(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

const TBL = (name: string) => `organization.${name}` as any;

export function createOrganizationsRouter(): Router {
  const router = Router();

  // ── Organizations CRUD ────────────────────────────────────────

  router.get('/organizations', requireAuth, requirePermission('admin:config:read'),
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('organizations')).select('*').order('name');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.get('/organizations/:id', requireAuth, requirePermission('admin:config:read'),
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('organizations')).select('*').eq('id', req.params.id).single();
      if (error || !data) return res.status(404).json({ error: 'Organization not found' });
      res.json(data);
    }
  );

  router.post('/organizations', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createOrganizationSchema),
    async (req: AuthedRequest, res: Response) => {
      const entry = { id: buildId('org'), ...req.body };
      const { error } = await supabase.from(TBL('organizations')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'ORGANIZATION_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.ORGANIZATION_CREATED, details: `Organization ${entry.code} created` });
      res.status(201).json(entry);
    }
  );

  router.patch('/organizations/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(updateOrganizationSchema),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TBL('organizations')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'Organization not found' });
      const { error } = await supabase.from(TBL('organizations')).update(req.body).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'ORGANIZATION_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.ORGANIZATION_UPDATED, details: `Organization ${req.params.id} updated` });
      res.json({ ok: true });
    }
  );

  // ── Business Units CRUD ───────────────────────────────────────

  router.get('/business-units', requireAuth, requirePermission('admin:config:read'),
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('business_units')).select('*').order('buid');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.get('/business-units/:id', requireAuth, requirePermission('admin:config:read'),
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('business_units')).select('*').eq('id', req.params.id).single();
      if (error || !data) return res.status(404).json({ error: 'Business unit not found' });
      res.json(data);
    }
  );

  router.post('/business-units', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createBuSchema),
    async (req: AuthedRequest, res: Response) => {
      const entry = { id: buildId('bu'), ...req.body };
      const { error } = await supabase.from(TBL('business_units')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'BUSINESS_UNIT_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.BUSINESS_UNIT_CREATED, details: `Business unit ${entry.buid} created` });
      res.status(201).json(entry);
    }
  );

  router.patch('/business-units/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(updateBuSchema),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TBL('business_units')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'Business unit not found' });
      const { error } = await supabase.from(TBL('business_units')).update(req.body).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'BUSINESS_UNIT_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.BUSINESS_UNIT_UPDATED, details: `Business unit ${req.params.id} updated` });
      res.json({ ok: true });
    }
  );

  // ── Payment Partners CRUD ─────────────────────────────────────

  router.get('/payment-partners', requireAuth, requirePermission('admin:config:read'),
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('payment_partners')).select('*').order('name');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.get('/payment-partners/:id', requireAuth, requirePermission('admin:config:read'),
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('payment_partners')).select('*').eq('id', req.params.id).single();
      if (error || !data) return res.status(404).json({ error: 'Payment partner not found' });
      res.json(data);
    }
  );

  router.post('/payment-partners', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createPartnerSchema),
    async (req: AuthedRequest, res: Response) => {
      const entry = { id: buildId('pp'), ...req.body };
      const { error } = await supabase.from(TBL('payment_partners')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'PAYMENT_PARTNER_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.PAYMENT_PARTNER_CREATED, details: `Payment partner ${entry.code} created` });
      res.status(201).json(entry);
    }
  );

  router.patch('/payment-partners/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(updatePartnerSchema),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TBL('payment_partners')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'Payment partner not found' });
      const { error } = await supabase.from(TBL('payment_partners')).update(req.body).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'PAYMENT_PARTNER_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.PAYMENT_PARTNER_UPDATED, details: `Payment partner ${req.params.id} updated` });
      res.json({ ok: true });
    }
  );

  // ── Partner-BU Junction ───────────────────────────────────────

  router.get('/partner-bu-links', requireAuth, requirePermission('admin:config:read'),
    async (req: AuthedRequest, res: Response) => {
      const { partnerId, buId } = req.query;
      let q = supabase.from(TBL('payment_partner_business_units')).select('*');
      if (partnerId) q = q.eq('payment_partner_id', partnerId);
      if (buId) q = q.eq('business_unit_id', buId);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.post('/partner-bu-links', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(linkBuSchema),
    async (req: AuthedRequest, res: Response) => {
      const { error } = await supabase.from(TBL('payment_partner_business_units')).insert(req.body);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'PARTNER_BU_LINK_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.PARTNER_BU_LINK_CREATED, details: 'Partner-BU link created' });
      res.status(201).json({ ok: true });
    }
  );

  router.delete('/partner-bu-links/:partnerId/:buId', requireAuth, requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const { partnerId, buId } = req.params;
      const { error } = await supabase
        .from(TBL('payment_partner_business_units'))
        .delete()
        .eq('payment_partner_id', partnerId)
        .eq('business_unit_id', buId);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'PARTNER_BU_LINK_DELETED', actor: req.user!.name, role: req.user!.role, action: AuditAction.PARTNER_BU_LINK_DELETED, details: 'Partner-BU link removed' });
      res.json({ ok: true });
    }
  );

  // ── Partner-BU lookup ─────────────────────────────────────────

  router.get('/payment-partners/:id/business-units', requireAuth, requirePermission('admin:config:read'),
    async (req: AuthedRequest, res: Response) => {
      const { data: links, error: linkErr } = await supabase
        .from(TBL('payment_partner_business_units'))
        .select('business_unit_id, status, effective_from, effective_to')
        .eq('payment_partner_id', req.params.id);
      if (linkErr) return res.status(500).json({ error: linkErr.message });
      if (!links || links.length === 0) return res.json([]);

      const buIds = links.map((l: any) => l.business_unit_id);
      const { data: bus, error: buErr } = await supabase
        .from(TBL('business_units')).select('*').in('id', buIds);
      if (buErr) return res.status(500).json({ error: buErr.message });

      const buMap = new Map((bus ?? []).map((b: any) => [b.id, b]));
      res.json(links.map((l: any) => ({
        ...l,
        businessUnit: buMap.get(l.business_unit_id) ?? null,
      })));
    }
  );

  return router;
}
