import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { appendAuditLog, listTickets, getTicket, getScopedTicket, upsertTicket, findOrCreateCustomer } from '../repository';
import { tenantIdForBu } from '../tenant';
import { getRoles, hasPermissionForRoleId, type Permission, type RoleDefinition } from '../rbac';
import { getConfig } from '../repository';
import { nextTicketId, normalizeBusinessUnits } from '../../src/lib/buCodes';

/**
 * Compute the next ticket id using the business-unit code prefix
 * (BUCODE-yymmdd-NNN). Falls back to the legacy `tkt-<ms>-<rand>` format
 * when the unit has no code on record, so creation never blocks.
 */
async function buildTicketId(businessUnit: string | undefined, existing: string[]): Promise<string> {
  const buRaw = await getConfig<any[]>('businessUnits', []);
  const buUnits = normalizeBusinessUnits(buRaw);
  const now = new Date();
  const code = (businessUnit || '').trim() ? (buUnits.find((b) => b.name.toUpperCase() === businessUnit!.toUpperCase())?.code) : undefined;
  if (!code) {
    return 'tkt-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 7);
  }
  return nextTicketId(businessUnit!, buUnits, existing, now);
}

/**
 * Resolve the customer_id for a ticket: honor an explicit customerId, otherwise
 * find-or-create the customer by (email, business_unit). Returns undefined when
 * there is nothing to link (no id, no email, or no resolvable business unit).
 */
async function linkTicketCustomer(ticket: any, fallbackBu?: string): Promise<string | undefined> {
  if (ticket.customerId) return ticket.customerId;
  const email = (ticket.customerEmail || '').trim();
  if (!email) return undefined;
  const businessUnit = (ticket.businessUnit || fallbackBu || '').trim();
  if (!businessUnit) return undefined;
  const name = [ticket.customerName, ticket.customerLastName].filter(Boolean).join(' ') || undefined;
  const { id } = await findOrCreateCustomer({ email, businessUnit, name, phone: ticket.customerPhone });
  return id;
}

export function createTicketsRouter(): Router {
  const router = Router();

  router.get('/tickets', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const tickets = await listTickets(req.user!, { includeDeleted: req.query.includeDeleted === 'true', unmask: req.query.unmask === 'true' });
    res.json(tickets);
  });

  router.get('/tickets/:id', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const ticket = await getTicket(req.params.id, req.user!, req.query.unmask === 'true');
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  });

  router.post('/tickets', requireAuth, requirePermission('tickets:create'), validateBody(z.object({ id: z.string().optional(), customerName: z.string().optional(), customerEmail: z.string().optional(), customerPhone: z.string().optional(), customerLastName: z.string().optional(), customerId: z.string().optional(), businessUnit: z.string().optional(), provider: z.string().optional(), category: z.string().optional(), priority: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).optional(), status: z.enum(['RECEIPT','ASSIGNED','INVESTIGATE','RESOLVED','CLOSED']).optional(), amount: z.number().optional(), transactionId: z.string().optional(), cardPan: z.string().optional(), description: z.string().optional(), bankName: z.string().optional(), slaDeadline: z.string().optional(), assignedAgentId: z.string().optional(), majorIncidentId: z.string().nullable().optional(), watchers: z.array(z.string()).optional(), submittedBy: z.enum(['BU_SUPPORT','PARTNER']).optional(), submittedByName: z.string().optional(), submittedByPhone: z.string().optional(), rootCause: z.string().optional(), correctiveAction: z.string().optional(), rcaDetails: z.record(z.string(), z.unknown()).optional(), customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(), duplicateOf: z.string().nullable().optional() }).passthrough()), async (req: AuthedRequest, res: Response) => {
    const ticket = req.body;
    if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'EXECUTIVE' && req.user!.bu !== 'ALL') {
      if (tenantIdForBu(ticket.businessUnit) !== (req.user!.tenantId || '')) {
        return res.status(403).json({ error: 'Cannot create a ticket outside your business unit' });
      }
    }
    const now = new Date().toISOString();
    const existingAll = await listTickets(req.user!, { includeDeleted: true });
    let entry: any = { ...ticket, id: ticket.id || (await buildTicketId(ticket.businessUnit, existingAll.map((t: any) => t.id))), createdAt: now, createdBy: req.user!.name };
    const customerId = await linkTicketCustomer(ticket, req.user!.role === 'PARTNER' ? req.user!.bu : undefined);
    if (customerId) entry = { ...entry, customerId };
    await upsertTicket(entry);
    await appendAuditLog({ ticketId: entry.id, actor: req.user!.name, role: req.user!.role, action: 'TICKET_CREATED', details: `Ticket ${entry.id} created` });
    res.status(201).json(entry);
  });

  router.patch('/tickets/:id', requireAuth, requirePermission('tickets:edit'), validateBody(z.object({ status: z.enum(['RECEIPT','ASSIGNED','INVESTIGATE','RESOLVED','CLOSED']).optional(), priority: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).optional(), category: z.string().optional(), description: z.string().optional(), amount: z.number().optional(), transactionId: z.string().optional(), provider: z.string().optional(), businessUnit: z.string().optional(), customerName: z.string().optional(), customerEmail: z.string().optional(), customerPhone: z.string().optional(), assignedAgentId: z.string().optional(), rootCause: z.string().optional(), correctiveAction: z.string().optional(), rcaDetails: z.record(z.string(), z.unknown()).optional(), isEscalated: z.boolean().optional(), escalationCount: z.number().optional(), bankName: z.string().optional(), watchers: z.array(z.string()).optional(), feedbackScore: z.number().nullable().optional(), feedbackComment: z.string().nullable().optional(), isDeleted: z.boolean().optional(), customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(), duplicateOf: z.string().optional() }).passthrough()), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedTicket(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const body: any = { ...req.body };

    // Stale-closure protection: provenance/immutable fields can never be
    // overwritten from a (possibly stale) client snapshot.
    for (const field of ['id', 'createdAt', 'createdBy', 'tenantId', 'tenant_id', 'created_at', 'majorIncidentId']) {
      delete body[field];
    }

    const roles = getRoles(await getConfig<RoleDefinition[]>('roles', []));
    const feat = (p: Permission) => hasPermissionForRoleId(roles, req.user!.role, p);

    // Escalation is a tracked operation: requires escalate privilege and the
    // counter is derived server-side from the persisted row (never from the body).
    delete body.escalationCount;
    if (body.isEscalated !== undefined && body.isEscalated !== existing.isEscalated) {
      if (!feat('tickets:escalate')) {
        return res.status(403).json({ error: 'Requires permission: tickets:escalate' });
      }
      if (body.isEscalated === true) {
        body.escalationCount = (existing.escalationCount || 0) + 1;
      }
    }

    // Marking a ticket as a duplicate requires merge privilege.
    if (body.duplicateOf !== undefined && body.duplicateOf !== existing.duplicateOf) {
      if (!feat('tickets:merge')) {
        return res.status(403).json({ error: 'Requires permission: tickets:merge' });
      }
    }

    const updated = { ...existing, ...body };
    const customerId = await linkTicketCustomer(updated, updated.businessUnit || req.user!.bu);
    if (customerId) updated.customerId = customerId;
    await upsertTicket(updated);
    await appendAuditLog({ ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: 'TICKET_UPDATED', details: `Ticket ${req.params.id} patched` });
    res.json(updated);
  });

  // Narrow feedback write for self-service portals. PARTNER / portal users do
  // NOT hold tickets:edit, so this is a dedicated low-risk endpoint that only
  // mutates feedbackScore / feedbackComment on tickets the caller may view and
  // owns or is BU-scoped to.
  router.patch('/tickets/:id/feedback', requireAuth, requirePermission('tickets:view'), validateBody(z.object({ feedbackScore: z.number().int().min(1).max(5).nullable().optional(), feedbackComment: z.string().max(500).nullable().optional() })), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedTicket(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const roles = getRoles(await getConfig<RoleDefinition[]>('roles', []));
    const canEdit = hasPermissionForRoleId(roles, req.user!.role, 'tickets:edit');
    const isOwnBu = req.user!.role === 'PARTNER' && existing.businessUnit === req.user!.bu;
    if (!canEdit && !isOwnBu) {
      return res.status(403).json({ error: 'Feedback can only be submitted on your own business unit tickets' });
    }

    const body: any = { ...req.body };
    const updated = {
      ...existing,
      feedbackScore: body.feedbackScore !== undefined ? body.feedbackScore : existing.feedbackScore,
      feedbackComment: body.feedbackComment !== undefined ? body.feedbackComment : existing.feedbackComment,
    };
    await upsertTicket(updated);
    await appendAuditLog({ ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: 'TICKET_FEEDBACK', details: `Feedback submitted for ticket ${req.params.id}` });
    res.json(updated);
  });

  router.delete('/tickets/:id', requireAuth, requirePermission('tickets:delete'), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedTicket(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });
    await upsertTicket({ ...existing, isDeleted: true });
    await appendAuditLog({ ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: 'TICKET_DELETED', details: `Ticket ${req.params.id} soft-deleted` });
    res.json({ ok: true });
  });

  return router;
}
