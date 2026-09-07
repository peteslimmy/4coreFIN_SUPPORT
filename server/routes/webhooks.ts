import { Router, type Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validateBody';
import { audit, AuditAction } from '../auditEvents';
import { supabase } from '../supabase';
import { dispatchWebhook } from '../services/webhookDispatcher';
import { buildId } from '../lib/ids';
import { checkWebhookUrl } from '../lib/webhookUrlGuard';

const webhookCreateSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).optional().default([]),
  tenant_id: z.string().optional(),
});

const webhookUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  tenant_id: z.string().optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field must be provided' });

export function createWebhooksRouter(): Router {
  const router = Router();

  // ── List all webhooks ────────────────────────────────────────
  router.get('/admin/webhooks', requireAuth, requirePermission('admin:config:read'), async (_req: AuthedRequest, res: Response) => {
    const { data, error } = await supabase
      .from('webhooks')
      .select('id, name, url, events, is_active, last_fired_at, created_at')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ── Get single webhook ───────────────────────────────────────
  router.get('/admin/webhooks/:id', requireAuth, requirePermission('admin:config:read'), async (req: AuthedRequest, res: Response) => {
    const { data, error } = await supabase
      .from('webhooks')
      .select('id, name, url, events, is_active, last_fired_at, created_at, created_by, tenant_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Webhook not found' });
    res.json(data);
  });

  // ── Create webhook ───────────────────────────────────────────
  router.post('/admin/webhooks', requireAuth, requirePermission('admin:config:write'),
    validateBody(webhookCreateSchema),
    async (req: AuthedRequest, res: Response) => {
      const { name, url, events, tenant_id } = req.body;
    const urlCheck = await checkWebhookUrl(String(url));
    if (!urlCheck.ok) {
      return res.status(400).json({ error: urlCheck.reason });
    }
    const id = buildId('wh');
    const secret = randomBytes(32).toString('hex');
    const { error } = await supabase.from('webhooks').insert({
      id, name, url, events: events || [], secret,
      tenant_id: tenant_id || null,
      created_by: req.user!.id,
    });
    if (error) return res.status(500).json({ error: error.message });
    await audit({ event: 'WEBHOOK_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.WEBHOOK_CREATED, details: `Created webhook: ${name}` });
    res.status(201).json({ id, name, url, events, is_active: true, tenant_id, secret });
  });

  // ── Update webhook ───────────────────────────────────────────
  const ALLOWED_UPDATE_FIELDS = new Set(['name', 'url', 'events', 'is_active', 'tenant_id']);

  router.put('/admin/webhooks/:id', requireAuth, requirePermission('admin:config:write'),
    validateBody(webhookUpdateSchema),
    async (req: AuthedRequest, res: Response) => {
      const patch: Record<string, unknown> = {};
      for (const key of Object.keys(req.body)) {
        if (ALLOWED_UPDATE_FIELDS.has(key)) {
          patch[key] = req.body[key];
        }
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No updatable fields provided' });
      }
    if (Object.prototype.hasOwnProperty.call(patch, 'url')) {
      const urlCheck = await checkWebhookUrl(String(patch.url));
      if (!urlCheck.ok) {
        return res.status(400).json({ error: urlCheck.reason });
      }
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('webhooks')
      .update(patch)
      .eq('id', req.params.id)
      .select('id, name, url, events, is_active, last_fired_at, created_at, tenant_id')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Webhook not found' });

    await audit({ event: 'WEBHOOK_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.WEBHOOK_UPDATED, details: `Updated webhook ${req.params.id}: changed ${Object.keys(patch).join(', ')}` });
    res.json(data);
  });

  // ── Delete webhook ───────────────────────────────────────────
  router.delete('/admin/webhooks/:id', requireAuth, requirePermission('admin:config:write'), async (req: AuthedRequest, res: Response) => {
    const { data, error: selectError } = await supabase
      .from('webhooks')
      .select('name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (selectError) return res.status(500).json({ error: selectError.message });
    const name = data?.name ?? req.params.id;

const { error } = await supabase.from('webhooks').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    await audit({ event: 'WEBHOOK_DELETED', actor: req.user!.name, role: req.user!.role, action: AuditAction.WEBHOOK_DELETED, details: `Deleted webhook: ${name}` });
    res.json({ ok: true });
  });

  // ── Delivery log for a webhook ───────────────────────────────
  router.get('/admin/webhooks/:id/deliveries', requireAuth, requirePermission('admin:config:read'), async (req: AuthedRequest, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const { count } = await supabase
      .from('webhook_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('webhook_id', req.params.id);

    const { data, error } = await supabase
      .from('webhook_deliveries')
      .select('id, event_type, response_status, response_body, error, delivered_at')
      .eq('webhook_id', req.params.id)
      .order('delivered_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data, total: count ?? 0, limit, offset });
  });

  // ── Test-fire a webhook (dry-run, dispatches but errors don't propagate) ──
  router.post('/admin/webhooks/:id/test', requireAuth, requirePermission('admin:config:write'), async (req: AuthedRequest, res: Response) => {
    const { data: wh, error: selErr } = await supabase
      .from('webhooks')
      .select('id, url, events, is_active')
      .eq('id', req.params.id)
      .maybeSingle();
    if (selErr) return res.status(500).json({ error: selErr.message });
    if (!wh) return res.status(404).json({ error: 'Webhook not found' });
    if (!wh.is_active) return res.status(400).json({ error: 'Webhook is inactive' });

    // Fire-and-forget: a full retry cycle across all matching webhooks can
    // take 40s+, which must never hold the HTTP response open. Delivery
    // outcomes are observable via GET /admin/webhooks/:id/deliveries.
    void dispatchWebhook('ticket.updated', { _test: true, firedBy: req.user!.name }).catch(() => {});
    res.json({ ok: true, message: `Test dispatch queued for ${wh.url}` });
  });

  return router;
}