import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { audit, AuditAction } from '../auditEvents';
import { supabase } from '../supabase';
import { buildId } from '../lib/ids';

// ── Zod schemas ────────────────────────────────────────────────────────

const campaignCreateSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().optional(),
  type: z.string().optional(),
  question: z.string().min(1, 'Question is required'),
  trigger_type: z.string().optional(),
  is_active: z.boolean().optional(),
});

const campaignUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  question: z.string().min(1).optional(),
  trigger_type: z.string().optional(),
  is_active: z.boolean().optional(),
});

const responseSubmitSchema = z.object({
  campaign_id: z.string().min(1, 'Campaign id is required'),
  ticket_id: z.string().min(1, 'Ticket id is required'),
  responder_email: z.string().email('Valid email is required'),
  rating: z.number().int().min(1).max(5, 'Rating must be 1-5'),
  comment: z.string().optional(),
});

// ── Router factory ─────────────────────────────────────────────────────

export function createSurveysRouter(): Router {
  const router = Router();

  // ── List campaigns ─────────────────────────────────────────────────
  router.get('/surveys/campaigns', requireAuth, async (_req: AuthedRequest, res: Response) => {
    const { data, error } = await supabase
      .from('surveys.survey_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ── Create campaign ────────────────────────────────────────────────
  router.post(
    '/surveys/campaigns',
    requireAuth,
    requirePermission('admin:config'),
    async (req: AuthedRequest, res: Response) => {
      const parsed = campaignCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]
          ? `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}`
          : 'Invalid request body';
        return res.status(400).json({ error: msg });
      }
      const { name, description, type, question, trigger_type, is_active } = parsed.data;
      const id = buildId('srv');
      const { data, error } = await supabase
        .from('surveys.survey_campaigns')
        .insert({
          id,
          name,
          description: description || '',
          type: type || 'CSAT',
          question,
          trigger_type: trigger_type || 'ticket_resolved',
          is_active: is_active !== undefined ? is_active : true,
          created_by: req.user!.name,
          tenant_id: req.user!.tenantId || '',
        })
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      await audit({
        event: 'SURVEY_CAMPAIGN_CREATED',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.SURVEY_CAMPAIGN_CREATED,
        details: `Created survey campaign: ${name}`,
      });
      res.status(201).json(data);
    },
  );

  // ── Update campaign ────────────────────────────────────────────────
  router.patch(
    '/surveys/campaigns/:id',
    requireAuth,
    requirePermission('admin:config'),
    async (req: AuthedRequest, res: Response) => {
      const parsed = campaignUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]
          ? `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}`
          : 'Invalid request body';
        return res.status(400).json({ error: msg });
      }
      const patch = { ...parsed.data };
      const { data: existing, error: fetchErr } = await supabase
        .from('surveys.survey_campaigns')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });

      const { data, error } = await supabase
        .from('surveys.survey_campaigns')
        .update(patch)
        .eq('id', req.params.id)
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      await audit({
        event: 'SURVEY_CAMPAIGN_UPDATED',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.SURVEY_CAMPAIGN_UPDATED,
        details: `Updated survey campaign ${req.params.id}`,
      });
      res.json(data);
    },
  );

  // ── Delete campaign ────────────────────────────────────────────────
  router.delete(
    '/surveys/campaigns/:id',
    requireAuth,
    requirePermission('admin:config'),
    async (req: AuthedRequest, res: Response) => {
      const { data: existing, error: fetchErr } = await supabase
        .from('surveys.survey_campaigns')
        .select('name')
        .eq('id', req.params.id)
        .maybeSingle();
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });

      const { error } = await supabase
        .from('surveys.survey_campaigns')
        .delete()
        .eq('id', req.params.id);
      if (error) return res.status(500).json({ error: error.message });
      await audit({
        event: 'SURVEY_CAMPAIGN_DELETED',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.SURVEY_CAMPAIGN_DELETED,
        details: `Deleted survey campaign: ${existing.name}`,
      });
      res.json({ ok: true });
    },
  );

  // ── Campaign stats ─────────────────────────────────────────────────
  router.get('/surveys/campaigns/:id/stats', requireAuth, async (req: AuthedRequest, res: Response) => {
    const { data, error } = await supabase
      .from('surveys.campaign_stats')
      .select('*')
      .eq('campaign_id', req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Campaign not found' });
    res.json(data);
  });

  // ── Campaign responses (paginated) ─────────────────────────────────
  router.get('/surveys/campaigns/:id/responses', requireAuth, async (req: AuthedRequest, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const query = supabase
      .from('surveys.survey_responses')
      .select('*', { count: 'exact' })
      .eq('campaign_id', req.params.id)
      .order('responded_at', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ responses: data, page, pageSize, total: count ?? 0 });
  });

  // ── Submit response ────────────────────────────────────────────────
  router.post('/surveys/submit', requireAuth, async (req: AuthedRequest, res: Response) => {
    const parsed = responseSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]
        ? `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}`
        : 'Invalid request body';
      return res.status(400).json({ error: msg });
    }
    const { campaign_id, ticket_id, responder_email, rating, comment } = parsed.data;

    const { data: campaign, error: campErr } = await supabase
      .from('surveys.survey_campaigns')
      .select('id')
      .eq('id', campaign_id)
      .maybeSingle();
    if (campErr) return res.status(500).json({ error: campErr.message });
    if (!campaign) return res.status(404).json({ error: 'Survey campaign not found' });

    const id = buildId('sr');
    const { data, error } = await supabase
      .from('surveys.survey_responses')
      .insert({
        id,
        campaign_id,
        ticket_id,
        responder_email,
        rating,
        comment: comment || '',
        tenant_id: req.user!.tenantId || '',
      })
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await audit({
      event: 'SURVEY_RESPONSE_RECEIVED',
      actor: req.user!.name,
      role: req.user!.role,
      action: AuditAction.SURVEY_RESPONSE_RECEIVED,
      details: `Survey response submitted for campaign ${campaign_id}, ticket ${ticket_id}`,
    });
    res.status(201).json(data);
  });

  // ── Overall stats across all campaigns ─────────────────────────────
  router.get('/surveys/overall', requireAuth, async (_req: AuthedRequest, res: Response) => {
    const { data, error } = await supabase
      .from('surveys.campaign_stats')
      .select('*');
    if (error) return res.status(500).json({ error: error.message });

    const campaigns = data || [];
    const totalResponses = campaigns.reduce((sum: number, c: any) => sum + (c.response_count || 0), 0);
    const overallAvg = totalResponses > 0
      ? campaigns.reduce((sum: number, c: any) => sum + (c.avg_rating || 0) * (c.response_count || 0), 0) / totalResponses
      : 0;
    const overallDistribution = { rating_1: 0, rating_2: 0, rating_3: 0, rating_4: 0, rating_5: 0 };
    for (const c of campaigns) {
      overallDistribution.rating_1 += c.rating_1_count || 0;
      overallDistribution.rating_2 += c.rating_2_count || 0;
      overallDistribution.rating_3 += c.rating_3_count || 0;
      overallDistribution.rating_4 += c.rating_4_count || 0;
      overallDistribution.rating_5 += c.rating_5_count || 0;
    }

    res.json({
      total_campaigns: campaigns.length,
      total_responses: totalResponses,
      overall_avg_rating: Number(overallAvg.toFixed(2)),
      rating_distribution: overallDistribution,
      campaigns,
    });
  });

  return router;
}
