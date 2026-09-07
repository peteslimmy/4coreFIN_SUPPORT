import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { getConfig, setConfig } from '../repository';
import { audit, AuditAction } from '../auditEvents';
import { runEscalationCheck } from '../escalationEngine';
import { supabase } from '../supabase';

const EscalationRuleSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  condition: z.object({
    hoursFromCreation: z.number().min(0),
    priority: z.string().optional(),
    category: z.string().optional(),
  }),
  actions: z.array(z.object({
    type: z.enum(['notify', 'reassign', 'escalate_priority']),
    target: z.string().optional(),
    message: z.string().optional(),
  })),
});

function configItemId(item: any): string {
  if (item == null) return '';
  if (typeof item === 'string') return String(item);
  return String(item.id ?? item.name ?? '');
}

export function createEscalationRouter(): Router {
  const router = Router();

  // ── List escalation rules ──
  router.get('/escalation/rules', requireAuth, async (_req: AuthedRequest, res: Response) => {
    const rules = await getConfig<any[]>('escalationRules', []);
    res.json(rules);
  });

  // ── Create escalation rule ──
  router.post(
    '/escalation/rules',
    requireAuth,
    requireRoles('SUPER_ADMIN'),
    validateBody(EscalationRuleSchema),
    async (req: AuthedRequest, res: Response) => {
      const rules = await getConfig<any[]>('escalationRules', []);
      const body = req.body as z.infer<typeof EscalationRuleSchema>;
      const id = body.id || `esc-${Date.now()}`;
      if (rules.some((r) => configItemId(r) === id)) {
        return res.status(409).json({ error: `Rule "${id}" already exists` });
      }
      const rule = { ...body, id };
      const next = [...rules, rule];
      await setConfig('escalationRules', next);
      await audit({
        event: 'ESCALATION_RULE_CREATED',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.ESCALATION_RULE_CREATED,
        details: `Created escalation rule ${id}`,
      });
      res.status(201).json(rule);
    }
  );

  // ── Update escalation rule ──
  router.patch(
    '/escalation/rules/:id',
    requireAuth,
    requireRoles('SUPER_ADMIN'),
    validateBody(EscalationRuleSchema.partial()),
    async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const rules = await getConfig<any[]>('escalationRules', []);
      const idx = rules.findIndex((r) => configItemId(r) === id);
      if (idx === -1) {
        return res.status(404).json({ error: `Rule "${id}" not found` });
      }
      const merged = { ...rules[idx], ...req.body, id };
      rules[idx] = merged;
      await setConfig('escalationRules', rules);
      await audit({
        event: 'ESCALATION_RULE_UPDATED',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.ESCALATION_RULE_UPDATED,
        details: `Updated escalation rule ${id}`,
      });
      res.json(merged);
    }
  );

  // ── Delete escalation rule ──
  router.delete(
    '/escalation/rules/:id',
    requireAuth,
    requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const rules = await getConfig<any[]>('escalationRules', []);
      const next = rules.filter((r) => configItemId(r) !== id);
      if (next.length === rules.length) {
        return res.status(404).json({ error: `Rule "${id}" not found` });
      }
      await setConfig('escalationRules', next);
      await audit({
        event: 'ESCALATION_RULE_DELETED',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.ESCALATION_RULE_DELETED,
        details: `Deleted escalation rule ${id}`,
      });
      res.status(204).end();
    }
  );

  // ── Manual trigger ──
  router.post(
    '/escalation/check',
    requireAuth,
    requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const result = await runEscalationCheck();
      await audit({
        event: 'ESCALATION_TRIGGERED',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.ESCALATION_TRIGGERED,
        details: `Manual escalation check: ${result.escalated} escalated, ${result.scanned} scanned`,
      });
      res.json(result);
    }
  );

  // ── Escalation notification log ──
  router.get('/escalation/log', requireAuth, async (_req: AuthedRequest, res: Response) => {
    const { data, error } = await supabase
      .from('escalation_notification_log')
      .select('*')
      .order('notified_at', { ascending: false })
      .limit(200);
    if (error || !data) return res.json([]);
    res.json(data);
  });

  return router;
}
