import { Router, type Response } from 'express';
import { randomBytes } from 'crypto';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { supabase } from '../supabase';
import { appendAuditLog } from '../repository';
import { registerDeliveryAttempt } from '../services/webhookDispatcher';
import { dispatchWebhook } from '../services/webhookDispatcher';

export function createWebhooksRouter(): Router {
  const router = Router();

  // ── List all webhooks ────────────────────────────────────────
  router.get('/admin/webhooks', requireAuth, requirePermission('admin:config'), async (_req: AuthedRequest, res: Response) => {
    const { data, error } = await supabase
      .from('webhooks')
      .select('id, name, url, events, is_active, last_fired_at, created_at')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ── Get single webhook ───────────────────────────────────────
  router.get('/admin/webhooks/:id', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
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
  router.post('/admin/webhooks', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    const { name, url, events, tenant_id } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' });
    }
    const id = 'wh-' + Date.now();
    const secret = randomBytes(32).toString('hex');
    const { error } = await supabase.from('webhooks').insert({
      id, name, url, events: events || [], secret,
      tenant_id: tenant_id || null,
      created_by: req.user!.id,
    });
    if (error) return res.status(500).json({ error: error.message });
    await appendAuditLog({
      ticketId: null,
      actor: req.user!.name,
      role: req.user!.role,
      action: 'ADMIN_WEBHOOK_CREATED',
      details: `Created webhook: ${name}`,
    });
    res.status(201).json({ id, name, url, events, is_active: true, tenant_id, secret });
  });

  // ── Update webhook ───────────────────────────────────────────
  const ALLOWED_UPDATE_FIELDS = new Set(['name', 'url', 'events', 'is_active', 'tenant_id']);

  router.put('/admin/webhooks/:id', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    const allowed = ['name', 'url', 'events', 'is_active', 'tenant_id'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        patch[key] = req.body[key];
      }
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
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

    await appendAuditLog({
      ticketId: null,
      actor: req.user!.name,
      role: req.user!.role,
      action: 'ADMIN_WEBHOOK_UPDATED',
      details: `Updated webhook ${req.params.id}: changed ${Object.keys(patch).join(', ')}`,
    });
    res.json(data);
  });

  // ── Delete webhook ───────────────────────────────────────────
  router.delete('/admin/webhooks/:id', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    const { data, error: selectError } = await supabase
      .from('webhooks')
      .select('name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (selectError) return res.status(500).json({ error: selectError.message });
    const name = data?.name ?? req.params.id;

const { error } = await supabase.from('webhooks').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    await appendAuditLog({
      ticketId: null,
      actor: req.user!.name,
      role: req.user!.role,
      action: 'ADMIN_WEBHOOK_DELETED',
      details: `Deleted webhook: ${name}`,
    });
    res.json({ ok: true });
  });

  // ── Delivery log for a webhook ───────────────────────────────
  router.get('/admin/webhooks/:id/deliveries', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
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
  router.post('/admin/webhooks/:id/test', requireAuth, requirePermission('admin:config'), async (req: AuthedRequest, res: Response) => {
    const { data: wh, error: selErr } = await supabase
      .from('webhooks')
      .select('id, url, events, is_active')
      .eq('id', req.params.id)
      .maybeSingle();
    if (selErr) return res.status(500).json({ error: selErr.message });
    if (!wh) return res.status(404).json({ error: 'Webhook not found' });
    if (!wh.is_active) return res.status(400).json({ error: 'Webhook is inactive' });

    await dispatchWebhook('ticket.updated', { _test: true, firedBy: req.user!.name });
    res.json({ ok: true, message: `Test dispatch queued for ${wh.url}` });
  });

  return router;
}