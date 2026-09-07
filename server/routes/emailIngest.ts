import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, requireRoles, type AuthedRequest } from '../auth';
import { audit, AuditAction } from '../auditEvents';
import { escapeLike } from '../lib/escapeLike';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time secret comparison. Compares SHA-256 digests so neither
 * length nor prefix of either value leaks through timing. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Fail-closed M2M auth gate for the inbound webhook. Applied as the FIRST
 * middleware on POST /api/email/webhook (before body validation) so every
 * unauthenticated/mis-authenticated request - regardless of body validity -
 * returns a uniform 401 and discloses no endpoint/schema metadata. */
function webhookSecretRequired(req: Request, res: Response, next: NextFunction): void {
  const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET;
  const provided = req.headers['x-webhook-secret'] as string;
  if (!webhookSecret || !provided || !secretsMatch(provided, webhookSecret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

const TBL = (name: string) => `email_ingest.${name}` as any;

const webhookSchema = z.object({
  from: z.string().email(),
  fromName: z.string().optional().default(''),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional().default([]),
  subject: z.string().optional().default(''),
  text: z.string().optional().default(''),
  html: z.string().optional().default(''),
  headers: z.record(z.string(), z.any()).optional().default({}),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        size: z.number(),
        content: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

const ruleSchema = z.object({
  matchField: z.enum(['from', 'to', 'subject', 'body']),
  matchOp: z.enum(['equals', 'contains', 'starts_with', 'ends_with', 'regex']),
  matchValue: z.string().min(1),
  action: z.enum(['auto_assign', 'set_category', 'set_priority', 'set_partner', 'ignore']),
  actionValue: z.string().optional().default(''),
  priority: z.number().int().optional().default(0),
});

export function createEmailIngestRouter(): Router {
  const router = Router();

  // POST /api/email/webhook — receive inbound email (requires shared-secret header when EMAIL_WEBHOOK_SECRET is set)
  router.post(
    '/email/webhook',
    webhookSecretRequired,
    validateBody(webhookSchema),
    async (req: AuthedRequest, res: Response) => {
      const body = req.body;
      const messageId =
        (req.headers['message-id'] as string) || `${Date.now()}-${crypto.randomUUID()}`;

      const emailRecord = {
        id: crypto.randomUUID(),
        message_id: messageId,
        from_address: body.from,
        from_name: body.fromName,
        to_addresses: body.to,
        cc_addresses: body.cc,
        subject: body.subject,
        body_text: body.text,
        body_html: body.html,
        headers: body.headers,
        attachments: body.attachments.map((a: any) => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
        })),
        received_at: new Date().toISOString(),
      };

      // Atomic dedupe (API-04): rely on the unique index on message_id
      // (migration 077) instead of a check-then-insert race. A concurrent
      // duplicate insert surfaces as 23505 and is answered as an idempotent
      // duplicate, exactly like the SLA job's notification dedupe pattern.
      const { error } = await supabase.from(TBL('inbound_emails')).insert(emailRecord);
      if (error) {
        if (
          (error as any).code === '23505' ||
          /duplicate key|unique constraint/i.test(error.message)
        ) {
          return res.status(200).json({ ok: true, duplicate: true });
        }
        return res.status(400).json({ error: error.message });
      }

      await audit({
        event: 'EMAIL_RECEIVED',
        actor: 'system',
        role: 'SYSTEM',
        action: AuditAction.EMAIL_RECEIVED,
        details: `Inbound email from ${body.from}: ${body.subject}`,
      });

      res.status(202).json({ ok: true, id: emailRecord.id });
    },
  );

  // GET /api/email/inbox — list inbound emails
  router.get(
    '/email/inbox',
    requireAuth,
    requireRoles('SUPER_ADMIN', 'BU_SUPPORT'),
    async (req: AuthedRequest, res: Response) => {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string) || 25);
      const offset = (page - 1) * limit;

      let query = supabase.from(TBL('inbound_emails')).select('*', { count: 'exact' });

      const processed = req.query.processed as string;
      if (processed !== undefined) query = query.eq('processed', processed === 'true');

      const from = req.query.from as string;
      if (from) query = query.ilike('from_address', `%${escapeLike(from)}%`);

      const { data, count, error } = await query
        .order('received_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return res.status(500).json({ error: error.message });
      res.json({ items: data ?? [], total: count ?? 0, page, limit });
    },
  );

  // GET /api/email/inbox/:id — get single inbound email
  router.get(
    '/email/inbox/:id',
    requireAuth,
    requireRoles('SUPER_ADMIN', 'BU_SUPPORT'),
    async (req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('inbound_emails'))
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Email not found' });
      res.json(data);
    },
  );

  // PATCH /api/email/inbox/:id/process — mark email as processed
  router.patch(
    '/email/inbox/:id/process',
    requireAuth,
    requireRoles('SUPER_ADMIN', 'BU_SUPPORT'),
    validateBody(
      z.object({
        ticket_id: z.string().optional(),
        error: z.string().optional(),
      }),
    ),
    async (req: AuthedRequest, res: Response) => {
      const { ticket_id, error: err } = req.body;
      const { data: ex } = await supabase
        .from(TBL('inbound_emails'))
        .select('id')
        .eq('id', req.params.id)
        .single();
      if (!ex) return res.status(404).json({ error: 'Email not found' });

      const { error } = await supabase
        .from(TBL('inbound_emails'))
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          ticket_id: ticket_id || null,
          error: err || null,
        })
        .eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true });
    },
  );

  // ── Inbound Rules ─────────────────────────────────────────

  router.get(
    '/email/rules',
    requireAuth,
    requireRoles('SUPER_ADMIN'),
    async (_req: AuthedRequest, res: Response) => {
      const { data, error } = await supabase
        .from(TBL('inbound_rules'))
        .select('*')
        .order('priority', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    },
  );

  router.post(
    '/email/rules',
    requireAuth,
    requireRoles('SUPER_ADMIN'),
    validateBody(ruleSchema),
    async (req: AuthedRequest, res: Response) => {
      const { matchField, matchOp, matchValue, action, actionValue, priority } = req.body;
      const entry = {
        id: crypto.randomUUID(),
        match_field: matchField,
        match_op: matchOp,
        match_value: matchValue,
        action,
        action_value: actionValue,
        priority,
      };
      const { error } = await supabase.from(TBL('inbound_rules')).insert(entry);
      if (error) return res.status(400).json({ error: error.message });
      await audit({
        event: 'CONFIG_UPDATED',
        actor: req.user!.name,
        role: req.user!.role,
        action: AuditAction.CONFIG_UPDATED,
        details: `Email rule created: ${matchField} ${matchOp}`,
      });
      res.status(201).json(entry);
    },
  );

  router.patch(
    '/email/rules/:id',
    requireAuth,
    requireRoles('SUPER_ADMIN'),
    validateBody(ruleSchema.partial()),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase
        .from(TBL('inbound_rules'))
        .select('id')
        .eq('id', req.params.id)
        .single();
      if (!ex) return res.status(404).json({ error: 'Rule not found' });
      const { error } = await supabase
        .from(TBL('inbound_rules'))
        .update(req.body)
        .eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true });
    },
  );

  router.delete(
    '/email/rules/:id',
    requireAuth,
    requireRoles('SUPER_ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const { data: ex } = await supabase
        .from(TBL('inbound_rules'))
        .select('id')
        .eq('id', req.params.id)
        .single();
      if (!ex) return res.status(404).json({ error: 'Rule not found' });
      const { error } = await supabase.from(TBL('inbound_rules')).delete().eq('id', req.params.id);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true });
    },
  );

  return router;
}
