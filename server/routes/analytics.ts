import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase';
import { requireAuth, type AuthedRequest } from '../auth';

const TBL = (name: string) => `analytics.${name}` as any;

export function createAnalyticsRouter(): Router {
  const router = Router();

  // GET /api/analytics/sla — SLA analytics summary
  router.get('/analytics/sla', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 30));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startStr = startDate.toISOString().slice(0, 10);

      const { data: snapshots, error } = await supabase
        .from(TBL('sla_daily_snapshot'))
        .select('*')
        .gte('snapshot_date', startStr)
        .order('snapshot_date', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });

      const items = snapshots ?? [];
      const totalBreached = items.reduce((sum: number, s: any) => sum + (s.breached_count || 0), 0);
      const totalAtRisk = items.reduce((sum: number, s: any) => sum + (s.at_risk_count || 0), 0);
      const avgResolution = items.length > 0
        ? items.reduce((sum: number, s: any) => sum + parseFloat(s.avg_resolution_hours || '0'), 0) / items.length
        : 0;

      res.json({
        period: { days, startDate: startStr },
        totalBreached,
        totalAtRisk,
        avgResolutionHours: Math.round(avgResolution * 100) / 100,
        dailySnapshots: items,
      });
    }
  );

  // GET /api/analytics/tickets — ticket flow analytics
  router.get('/analytics/tickets', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 30));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startStr = startDate.toISOString().slice(0, 10);

      const { data: snapshots, error } = await supabase
        .from(TBL('ticket_daily_snapshot'))
        .select('*')
        .gte('snapshot_date', startStr)
        .order('snapshot_date', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });

      const items = snapshots ?? [];
      const totalCreated = items.reduce((sum: number, s: any) => sum + (s.created_count || 0), 0);
      const totalResolved = items.reduce((sum: number, s: any) => sum + (s.resolved_count || 0), 0);
      const totalClosed = items.reduce((sum: number, s: any) => sum + (s.closed_count || 0), 0);
      const avgFirstResponse = items.length > 0
        ? items.reduce((sum: number, s: any) => sum + parseFloat(s.avg_first_response_hours || '0'), 0) / items.length
        : 0;

      res.json({
        period: { days, startDate: startStr },
        totalCreated,
        totalResolved,
        totalClosed,
        resolutionRate: totalCreated > 0 ? Math.round((totalResolved / totalCreated) * 100) : 0,
        avgFirstResponseHours: Math.round(avgFirstResponse * 100) / 100,
        dailySnapshots: items,
      });
    }
  );

  // GET /api/analytics/partners — partner performance
  router.get('/analytics/partners', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 30));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startStr = startDate.toISOString().slice(0, 10);

      const { data: snapshots, error } = await supabase
        .from(TBL('partner_daily_snapshot'))
        .select('*')
        .gte('snapshot_date', startStr)
        .order('snapshot_date', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });

      const items = snapshots ?? [];
      const byPartner: Record<string, any> = {};
      for (const s of items) {
        const p = s.partner_name as string;
        if (!byPartner[p]) byPartner[p] = { totalTickets: 0, resolvedCount: 0, breachedCount: 0, avgResolutionHours: 0, samples: 0 };
        byPartner[p].totalTickets += s.total_tickets || 0;
        byPartner[p].resolvedCount += s.resolved_count || 0;
        byPartner[p].breachedCount += s.breached_count || 0;
        byPartner[p].avgResolutionHours += parseFloat(s.avg_resolution_hours || '0');
        byPartner[p].samples++;
      }
      for (const p of Object.keys(byPartner)) {
        if (byPartner[p].samples > 0) byPartner[p].avgResolutionHours = Math.round(byPartner[p].avgResolutionHours / byPartner[p].samples * 100) / 100;
        delete byPartner[p].samples;
      }

      res.json({
        period: { days, startDate: startStr },
        partners: byPartner,
        dailySnapshots: items,
      });
    }
  );

  // GET /api/analytics/snapshot — trigger or check snapshot status
  router.get('/analytics/snapshot/status', requireAuth,
    async (_req: AuthedRequest, res: Response) => {
      const { data: latest, error } = await supabase
        .from(TBL('sla_daily_snapshot'))
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
      res.json({ latestSnapshot: latest?.snapshot_date || null });
    }
  );

  return router;
}
