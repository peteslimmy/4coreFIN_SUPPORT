import { Router, type Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { audit, AuditAction } from '../auditEvents';

const TBL = (name: string) => `workflow.${name}` as const;

const createStateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  terminal: z.boolean().optional().default(false),
});

const createTransitionSchema = z.object({
  fromStateCode: z.string().min(1).max(50),
  toStateCode: z.string().min(1).max(50),
  commandCode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});

const createTransitionRuleSchema = z.object({
  transitionId: z.string().min(1),
  roleCode: z.string().min(1).max(50),
  requiresFields: z.array(z.string()).optional().default([]),
});

export function createWorkflowRouter(): Router {
  const router = Router();

  // ── States ─────────────────────────────────────────────────

  router.get('/workflow/states', requireAuth,
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('states')).select('*').order('code');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.get('/workflow/states/:id', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('states')).select('*').eq('id', req.params.id).single();
      if (error || !data) return res.status(404).json({ error: 'State not found' });
      res.json(data);
    }
  );

  router.post('/workflow/states', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createStateSchema),
    async (req: AuthedRequest, res: Response) => {
      const entry = { id: crypto.randomUUID(), ...req.body };
      const { error } = await supabase.from(TBL('states')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'WORKFLOW_STATE_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Workflow state ${entry.code} created` });
      res.status(201).json(entry);
    }
  );

  router.patch('/workflow/states/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createStateSchema.partial()),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TBL('states')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'State not found' });
      const { error } = await supabase.from(TBL('states')).update(req.body).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'WORKFLOW_STATE_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Workflow state ${req.params.id} updated` });
      res.json({ ok: true });
    }
  );

  // ── Transitions ────────────────────────────────────────────

  router.get('/workflow/transitions', requireAuth,
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('transitions')).select('*').order('command_code');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.get('/workflow/transitions/:id', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('transitions')).select('*').eq('id', req.params.id).single();
      if (error || !data) return res.status(404).json({ error: 'Transition not found' });
      res.json(data);
    }
  );

  router.post('/workflow/transitions', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createTransitionSchema),
    async (req: AuthedRequest, res: Response) => {
      const { fromStateCode, toStateCode, ...rest } = req.body;

      const { data: fromState } = await supabase
        .from(TBL('states')).select('id').eq('code', fromStateCode).single();
      if (!fromState) return res.status(400).json({ error: `State ${fromStateCode} not found` });

      const { data: toState } = await supabase
        .from(TBL('states')).select('id').eq('code', toStateCode).single();
      if (!toState) return res.status(400).json({ error: `State ${toStateCode} not found` });

      const entry = { id: crypto.randomUUID(), from_state_id: fromState.id, to_state_id: toState.id, ...rest };
      const { error } = await supabase.from(TBL('transitions')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'WORKFLOW_TRANSITION_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Transition ${fromStateCode}→${toStateCode} created` });
      res.status(201).json(entry);
    }
  );

  router.patch('/workflow/transitions/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createTransitionSchema.partial()),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TBL('transitions')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'Transition not found' });
      const { error } = await supabase.from(TBL('transitions')).update(req.body).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'WORKFLOW_TRANSITION_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Transition ${req.params.id} updated` });
      res.json({ ok: true });
    }
  );

  // ── Transition Rules ───────────────────────────────────────

  router.get('/workflow/rules', requireAuth,
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('transition_rules')).select('*').order('role_code');
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    }
  );

  router.post('/workflow/rules', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createTransitionRuleSchema),
    async (req: AuthedRequest, res: Response) => {
      const { transitionId, roleCode, requiresFields } = req.body;
      const entry = { id: crypto.randomUUID(), transition_id: transitionId, role_code: roleCode, requires_fields: requiresFields };
      const { error } = await supabase.from(TBL('transition_rules')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'WORKFLOW_RULE_CREATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Rule for transition ${req.body.transitionId} created` });
      res.status(201).json(entry);
    }
  );

  router.patch('/workflow/rules/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    validateBody(createTransitionRuleSchema.partial()),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TBL('transition_rules')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'Rule not found' });
      const { error } = await supabase.from(TBL('transition_rules')).update(req.body).eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'WORKFLOW_RULE_UPDATED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Rule ${req.params.id} updated` });
      res.json({ ok: true });
    }
  );

  router.delete('/workflow/rules/:id', requireAuth, requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase.from(TBL('transition_rules')).select('id').eq('id', req.params.id).single();
      if (!ex) return res.status(404).json({ error: 'Rule not found' });
      const { error } = await supabase.from(TBL('transition_rules')).delete().eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      await audit({ event: 'WORKFLOW_RULE_DELETED', actor: req.user!.name, role: req.user!.role, action: AuditAction.CONFIG_UPDATED, details: `Rule ${req.params.id} deleted` });
      res.json({ ok: true });
    }
  );

  // ── Available transitions for a ticket ──────────────────────

  router.get('/workflow/available/:ticketStateCode', requireAuth,
    async (req: AuthedRequest, res: Response) => {
      const { data: state } = await supabase
        .from(TBL('states')).select('id').eq('code', req.params.ticketStateCode).single();
      if (!state) return res.status(404).json({ error: 'State not found' });

      const { data: transitions, error } = await supabase
        .from(TBL('transitions')).select('*').eq('from_state_id', state.id).eq('active', true);
      if (error) return res.status(500).json({ error: error.message });
      res.json(transitions ?? []);
    }
  );

  return router;
}
