import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { audit, AuditAction } from '../auditEvents';

const TBL = (name: string) => `notify.${name}` as any;

const preferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  slackEnabled: z.boolean().optional(),
  teamsEnabled: z.boolean().optional(),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string(),
    end: z.string(),
  }).optional(),
  categories: z.record(z.string(), z.boolean()).optional(),
});

const templateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  channel: z.enum(['email', 'push', 'sms', 'slack', 'teams']),
  subject: z.string().optional().default(''),
  bodyHtml: z.string().optional().default(''),
  bodyText: z.string().optional().default(''),
  variables: z.array(z.string()).optional().default([]),
});

export function createNotificationRouter(): Router {
  const router = Router();

  // ── Preferences ───────────────────────────────────────────

  router.get('/notifications/preferences', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('preferences'))
        .select('*')
        .eq('user_id', req.user!.id)
        .single();
      if (error || !data) {
        const defaults = {
          id: crypto.randomUUID(),
          user_id: req.user!.id,
          email_enabled: true,
          push_enabled: true,
          sms_enabled: false,
          slack_enabled: false,
          teams_enabled: false,
          quiet_hours: { enabled: false, start: '22:00', end: '07:00' },
          categories: { sla: true, assignment: true, comment: true, status_change: true, major_incident: true },
        };
        return res.json(defaults);
      }
      res.json(data);
    }
  );

  router.put('/notifications/preferences', requireAuth,
    validateBody(preferencesSchema),
    async (req: AuthedRequest, res: Response) => {
      const body = req.body;
      const update: Record<string, any> = { updated_at: new Date().toISOString() };
      if (body.emailEnabled !== undefined) update.email_enabled = body.emailEnabled;
      if (body.pushEnabled !== undefined) update.push_enabled = body.pushEnabled;
      if (body.smsEnabled !== undefined) update.sms_enabled = body.smsEnabled;
      if (body.slackEnabled !== undefined) update.slack_enabled = body.slackEnabled;
      if (body.teamsEnabled !== undefined) update.teams_enabled = body.teamsEnabled;
      if (body.quietHours) update.quiet_hours = body.quietHours;
      if (body.categories) update.categories = body.categories;

      const { data: existing } = await supabase
        .from(TBL('preferences'))
        .select('id')
        .eq('user_id', req.user!.id)
        .single();

      if (existing) {
        const { error } = await supabase.from(TBL('preferences')).update(update).eq('user_id', req.user!.id);
        if (error) return res.status(400).json({ error: error.message });
      } else {
        const entry = { id: crypto.randomUUID(), user_id: req.user!.id, ...update };
        const { error } = await supabase.from(TBL('preferences')).insert(entry);
        if (error) return res.status(400).json({ error: error.message });
      }
      res.json({ ok: true });
    }
  );

  // ── Templates ─────────────────────────────────────────────

  router.get('/notifications/templates', requireAuth, requireRoles('SUPER_ADMIN'),
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('templates'))
        .select('*')
        .order('code');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.get('/notifications/templates/:code', requireAuth, requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('templates'))
        .select('*')
        .eq('code', req.params.code)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Template not found' });
      res.json(data);
    }
  );

  router.post('/notifications/templates', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(templateSchema),
    async (req: AuthedRequest, res: Response) => {
      const entry = { id: crypto.randomUUID(), ...req.body };
      const { error } = await supabase.from(TBL('templates')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'CONFIG_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Notification template ${entry.code} created` });
      res.status(201).json(entry);
    }
  );

  router.patch('/notifications/templates/:code', requireAuth, requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TBL('templates')).select('code').eq('code', req.params.code).single();
      if (!ex) return res.status(404).json({ error: 'Template not found' });
      const { error } = await supabase.from(TBL('templates')).update({ ...req.body, updated_at: new Date().toISOString() }).eq('code', req.params.code);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true });
    }
  );

  // ── Delivery Log ──────────────────────────────────────────

  router.get('/notifications/delivery-log', requireAuth, requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string) || 25);
      const offset = (page - 1) * limit;

      let query = supabase.from(TBL('delivery_log')).select('*', { count: 'exact' });

      const status = req.query.status as string;
      if (status) query = query.eq('status', status);

      const channel = req.query.channel as string;
      if (channel) query = query.eq('channel', channel);

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return res.status(500).json({ error: error.message });
      res.json({ items: data ?? [], total: count ?? 0, page, limit });
    }
  );

  return router;
}
