import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { audit, AuditAction } from '../auditEvents';
import { supabase } from '../supabase';
import { buildId } from '../lib/ids';
import { listTickets } from '../repository';

function partnerId(req: AuthedRequest): string {
  return (req.user!.partner || req.user!.bu || '').toLowerCase();
}

const createSavedReplySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
});

const updateSavedReplySchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

export function createPartnerPortalRouter(): Router {
  const router = Router();

  // ── Scorecard ──────────────────────────────────────────────────────
  router.get('/partner/scorecard', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const pid = partnerId(req);
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const periodEnd = now.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('partner_portal.partner_scorecards')
      .select('*')
      .eq('partner_id', pid)
      .gte('period_start', periodStart)
      .lte('period_end', periodEnd)
      .order('period_start', { ascending: false })
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || { partner_id: pid, period_start: periodStart, period_end: periodEnd, total_tickets: 0, resolved_tickets: 0, breached_tickets: 0, avg_resolution_hours: null, sla_compliance_pct: null });
  });

  router.get('/partner/scorecard/history', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const pid = partnerId(req);
    const limit = req.query.limit ? Math.min(Number(req.query.limit) || 12, 52) : 12;

    const { data, error } = await supabase
      .from('partner_portal.partner_scorecards')
      .select('*')
      .eq('partner_id', pid)
      .order('period_start', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  // ── Metrics ────────────────────────────────────────────────────────
  router.get('/partner/metrics', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const pid = partnerId(req);

    const { data, error } = await supabase
      .from('partner_portal.partner_metrics')
      .select('*')
      .eq('partner_id', pid)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || { partner_id: pid, total_tickets: 0, resolved_tickets: 0, avg_resolution_hours: null, sla_compliance_pct: null });
  });

  // ── Saved Replies ──────────────────────────────────────────────────
  router.get('/partner/saved-replies', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const pid = partnerId(req);

    const { data, error } = await supabase
      .from('partner_portal.saved_replies')
      .select('*')
      .eq('partner_id', pid)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  router.post('/partner/saved-replies', requireAuth, requirePermission('tickets:edit'), validateBody(createSavedReplySchema), async (req: AuthedRequest, res: Response) => {
    const pid = partnerId(req);
    const entry = {
      id: buildId('sr'),
      partner_id: pid,
      title: req.body.title,
      body: req.body.body,
      created_by: req.user!.email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('partner_portal.saved_replies').insert(entry);
    if (error) return res.status(500).json({ error: error.message });

    await audit({
      actor: req.user!.name,
      role: req.user!.role,
      action: AuditAction.PARTNER_SAVED_REPLY_CREATED,
      details: `Saved reply "${entry.title}" created for partner ${pid}`,
    });

    res.status(201).json(entry);
  });

  router.patch('/partner/saved-replies/:id', requireAuth, requirePermission('tickets:edit'), validateBody(updateSavedReplySchema), async (req: AuthedRequest, res: Response) => {
    const pid = partnerId(req);

    const { data: existing, error: fetchErr } = await supabase
      .from('partner_portal.saved_replies')
      .select('*')
      .eq('id', req.params.id)
      .eq('partner_id', pid)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!existing) return res.status(404).json({ error: 'Saved reply not found' });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (req.body.title !== undefined) patch.title = req.body.title;
    if (req.body.body !== undefined) patch.body = req.body.body;

    const { error } = await supabase
      .from('partner_portal.saved_replies')
      .update(patch)
      .eq('id', req.params.id)
      .eq('partner_id', pid);

    if (error) return res.status(500).json({ error: error.message });

    await audit({
      actor: req.user!.name,
      role: req.user!.role,
      action: AuditAction.PARTNER_SAVED_REPLY_UPDATED,
      details: `Saved reply ${req.params.id} updated for partner ${pid}`,
    });

    res.json({ ...existing, ...patch });
  });

  router.delete('/partner/saved-replies/:id', requireAuth, requirePermission('tickets:edit'), async (req: AuthedRequest, res: Response) => {
    const pid = partnerId(req);

    const { data: existing, error: fetchErr } = await supabase
      .from('partner_portal.saved_replies')
      .select('*')
      .eq('id', req.params.id)
      .eq('partner_id', pid)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!existing) return res.status(404).json({ error: 'Saved reply not found' });

    const { error } = await supabase
      .from('partner_portal.saved_replies')
      .delete()
      .eq('id', req.params.id)
      .eq('partner_id', pid);

    if (error) return res.status(500).json({ error: error.message });

    await audit({
      actor: req.user!.name,
      role: req.user!.role,
      action: AuditAction.PARTNER_SAVED_REPLY_DELETED,
      details: `Saved reply ${req.params.id} deleted for partner ${pid}`,
    });

    res.json({ ok: true });
  });

  // ── Partner-scoped tickets ─────────────────────────────────────────
  router.get('/partner/tickets', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const tickets = await listTickets(req.user!, {
      includeDeleted: false,
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? Math.min(Number(req.query.limit) || 20, 200) : undefined,
      offset: req.query.offset ? Math.max(Number(req.query.offset) || 0, 0) : undefined,
    });
    res.json(tickets);
  });

  return router;
}
