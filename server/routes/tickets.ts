import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { audit, AuditAction } from '../auditEvents';
import { listTickets, getTicket, getScopedTicket, upsertTicket, findOrCreateCustomer, listJsonTable } from '../repository';
import { dispatchWebhook } from '../services/webhookDispatcher';
import { tenantIdForBu } from '../tenant';
import { getRoles, hasPermissionForRoleId, type Permission, type RoleDefinition } from '../rbac';
import { getCachedRoles } from '../middleware/requirePermission';
import { getConfig } from '../repository';
import { nextTicketId, normalizeBusinessUnits } from '../../src/lib/buCodes';
import { buildId } from '../lib/ids';
import { computeSlaDeadline } from '../../src/lib/slaCalculator';
import { TicketStatus, TicketPriority, UserRole } from '../../src/types/app';
import { applyTransition, getAvailableTransitions, getTransitionBlockers } from '../../src/lib/ticketStateMachine';
import type { SlaRule } from '../../src/types/admin';
import type { HolidayRecord } from '../../src/types/admin';

async function buildTicketId(businessUnit: string | undefined, existing: string[]): Promise<string> {
  const buRaw = await getConfig<any[]>('businessUnits', []);
  const buUnits = normalizeBusinessUnits(buRaw);
  const now = new Date();
  const code = (businessUnit || '').trim() ? (buUnits.find((b) => b.name.toUpperCase() === businessUnit!.toUpperCase())?.code) : undefined;
  if (!code) {
    return buildId('tkt');
  }
  return nextTicketId(businessUnit!, buUnits, existing, now);
}

const createTicketSchema = z.object({
  id: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string({ error: 'Customer email is required' }).trim().min(1, 'Customer email is required'),
  customerPhone: z.string().optional(),
  customerLastName: z.string().optional(),
  customerId: z.string().optional(),
  businessUnit: z.string({ error: 'Business unit is required' }).trim().min(1, 'Business unit is required'),
  partner: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED', 'WAITING_CUSTOMER', 'WAITING_PARTNER', 'WAITING_INTERNAL']).optional(),
  amount: z.number().optional(),
  transactionId: z.string().optional(),
  cardPan: z.string().optional(),
  description: z.string().optional(),
  bankName: z.string().optional(),
  slaDeadline: z.string().optional(),
  assignedAgentId: z.string().optional(),
  majorIncidentId: z.string().nullable().optional(),
  watchers: z.array(z.string()).optional(),
  submittedBy: z.enum(['BU_SUPPORT', 'PARTNER', 'CUSTOMER']).optional(),
  submittedByName: z.string().optional(),
  submittedByPhone: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  rcaDetails: z.record(z.string(), z.unknown()).optional(),
  customFields: z.record(z.string(), z.any()).optional(),
  duplicateOf: z.string().nullable().optional(),
});

const updateTicketSchema = z.object({
  // `status` and `to` are both accepted for backwards compatibility, but every
  // status change is routed through the state machine — the generic patch path
  // below never applies a raw status.
  status: z.enum(['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED', 'WAITING_CUSTOMER', 'WAITING_PARTNER', 'WAITING_INTERNAL']).optional(),
  to: z.enum(['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED', 'WAITING_CUSTOMER', 'WAITING_PARTNER', 'WAITING_INTERNAL']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  transactionId: z.string().optional(),
  partner: z.string().optional(),
  businessUnit: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  assignedAgentId: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  rcaDetails: z.record(z.string(), z.unknown()).optional(),
  isEscalated: z.boolean().optional(),
  escalationCount: z.number().optional(),
  bankName: z.string().optional(),
  watchers: z.array(z.string()).optional(),
  feedbackScore: z.number().nullable().optional(),
  feedbackComment: z.string().nullable().optional(),
  isDeleted: z.boolean().optional(),
  customFields: z.record(z.string(), z.any()).optional(),
  duplicateOf: z.string().optional(),
});

export function createTicketsRouter(): Router {
  const router = Router();

  router.get('/tickets', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const limit = req.query.limit ? Math.min(Number(req.query.limit) || 20, 200) : undefined;
    const offset = req.query.offset ? Math.max(Number(req.query.offset) || 0, 0) : undefined;
    const roles = getCachedRoles(res);
    const wantsUnmask = req.query.unmask === 'true';
    const canUnmask = hasPermissionForRoleId(roles, req.user!.role, 'tickets:unmask');
    if (wantsUnmask && !canUnmask) {
      return res.status(403).json({ error: 'Requires permission: tickets:unmask' });
    }
    const tickets = await listTickets(req.user!, {
      includeDeleted: req.query.includeDeleted === 'true',
      unmask: wantsUnmask && canUnmask,
      limit,
      offset,
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      businessUnit: req.query.businessUnit as string | undefined,
      partner: req.query.partner as string | undefined,
      search: req.query.search as string | undefined,
    });
    const total = tickets.length > 0 ? (tickets[0] as any)._totalCount ?? tickets.length : 0;
    const paging = limit ? { limit, offset: offset ?? 0, total } : undefined;
    res.json(paging ? { tickets, ...paging } : tickets);
  });

  router.get('/tickets/:id', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const roles = getCachedRoles(res);
    const wantsUnmask = req.query.unmask === 'true';
    const canUnmask = hasPermissionForRoleId(roles, req.user!.role, 'tickets:unmask');
    if (wantsUnmask && !canUnmask) {
      return res.status(403).json({ error: 'Requires permission: tickets:unmask' });
    }
    const ticket = await getTicket(req.params.id, req.user!, wantsUnmask && canUnmask);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  });

  router.post('/tickets', requireAuth, requirePermission('tickets:create'), validateBody(createTicketSchema), async (req: AuthedRequest, res: Response) => {
    const ticket = req.body;
    if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'EXECUTIVE' && req.user!.bu !== 'ALL') {
      if (tenantIdForBu(ticket.businessUnit) !== (req.user!.tenantId || '')) {
        return res.status(403).json({ error: 'Cannot create a ticket outside your business unit' });
      }
    }
    const now = new Date().toISOString();
    const existingAll = await listTickets(req.user!, { includeDeleted: true });
    let entry: any = { ...ticket, id: ticket.id || (await buildTicketId(ticket.businessUnit, existingAll.map((t: any) => t.id))), createdAt: now, createdBy: req.user!.name };
    const customerId = await findOrCreateCustomer({ email: ticket.customerEmail || '', businessUnit: ticket.businessUnit || (req.user!.role === 'PARTNER' ? req.user!.bu : undefined), name: ticket.customerName || undefined });
    if (customerId) entry = { ...entry, customerId: customerId.id };
    await upsertTicket(entry);
    await audit({ event: 'TICKET_CREATED', ticketId: entry.id, actor: req.user!.name, role: req.user!.role, action: AuditAction.TICKET_CREATED, details: `Ticket ${entry.id} created` });
    res.status(201).json(entry);
  });

  router.patch('/tickets/:id', requireAuth, requirePermission('tickets:edit'), validateBody(updateTicketSchema), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedTicket(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const body: any = { ...req.body };

    for (const field of ['id', 'createdAt', 'createdBy', 'tenantId', 'tenant_id', 'created_at', 'majorIncidentId']) {
      delete body[field];
    }

    const roles = getCachedRoles(res);
    const feat = (p: Permission) => hasPermissionForRoleId(roles, req.user!.role, p);

    // Every status change goes through the state machine. `to` is the explicit
    // transition field; `status` is accepted as an alias for older clients.
    // Neither is ever applied as a raw field by the generic patch path below.
    const targetStatus = (body.to ?? body.status) as TicketStatus | undefined;
    delete body.to;
    delete body.status;

    if (targetStatus !== undefined && targetStatus !== existing.status) {
      const available = getAvailableTransitions(existing, req.user!.role as UserRole);
      const rule = available.find((r) => r.to === targetStatus);
      if (!rule) {
        const allowed = available.map((r) => ({ to: r.to, label: r.label }));
        return res.status(400).json({ error: `Transition ${existing.status} → ${targetStatus} is not allowed for role ${req.user!.role}`, allowed });
      }
      const blockers = getTransitionBlockers(existing, rule);
      if (blockers.length > 0) {
        return res.status(400).json({ error: `Transition blocked: ${blockers.join(', ')}`, blockers });
      }
      const mutated = applyTransition(existing, targetStatus, req.user!.role as UserRole, { actor: req.user!.name });
      const updated = { ...mutated, ...body };
      const cid = await findOrCreateCustomer({ email: existing.customerEmail || '', businessUnit: existing.businessUnit || (req.user!.role === 'PARTNER' ? existing.businessUnit : undefined), name: existing.customerName || undefined });
      if (cid) updated.customerId = cid.id;
      await upsertTicket(updated);
      const transitionDetails = `Ticket ${req.params.id} transitioned ${existing.status} → ${targetStatus} by ${req.user!.role} via "${rule.label}"`;
      await audit({ event: 'TICKET_TRANSITION', ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: AuditAction.TICKET_TRANSITION, details: transitionDetails });
      dispatchWebhook('ticket.transitioned', { id: existing.id, from: existing.status, to: targetStatus, actorRole: req.user!.role }).catch(() => {});
      res.json(updated);
      return;
    }

    delete body.escalationCount;
    if (body.isEscalated !== undefined && body.isEscalated !== existing.isEscalated) {
      if (!feat('tickets:escalate')) {
        return res.status(403).json({ error: 'Requires permission: tickets:escalate' });
      }
      if (body.isEscalated === true) {
        body.escalationCount = (existing.escalationCount || 0) + 1;
      }
    }

    if (body.priority === 'CRITICAL' && existing.priority !== 'CRITICAL') {
      if (!feat('tickets:escalate')) {
        return res.status(403).json({ error: 'Requires permission: tickets:escalate' });
      }
      if (existing.createdAt) {
        const [slaRules, holidays] = await Promise.all([listJsonTable('sla_rules'), listJsonTable('holidays')]);
        body.slaDeadline = computeSlaDeadline(new Date(existing.createdAt), existing.category || '', TicketPriority.CRITICAL, slaRules as SlaRule[], holidays as HolidayRecord[]).deadline.toISOString();
      }
    }

    if (body.priority && body.priority !== existing.priority && body.priority !== 'CRITICAL') {
      if (existing.createdAt) {
        const [slaRules, holidays] = await Promise.all([listJsonTable('sla_rules'), listJsonTable('holidays')]);
        body.slaDeadline = computeSlaDeadline(new Date(existing.createdAt), existing.category || '', body.priority as TicketPriority, slaRules as SlaRule[], holidays as HolidayRecord[]).deadline.toISOString();
      }
    }

    if (body.duplicateOf !== undefined && body.duplicateOf !== existing.duplicateOf) {
      if (!feat('tickets:merge')) {
        return res.status(403).json({ error: 'Requires permission: tickets:merge' });
      }
    }

    const updated = { ...existing, ...body };
    const cid2 = await findOrCreateCustomer({ email: existing.customerEmail || '', businessUnit: existing.businessUnit || (req.user!.role === 'PARTNER' ? existing.businessUnit : undefined), name: existing.customerName || undefined });
    if (cid2) updated.customerId = cid2.id;
    await upsertTicket(updated);
    await audit({ event: 'TICKET_UPDATED', ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: AuditAction.TICKET_UPDATED, details: `Ticket ${req.params.id} patched` });
    res.json(updated);
  });

  router.patch('/tickets/:id/feedback', requireAuth, requirePermission('tickets:view'), validateBody(z.object({ feedbackScore: z.number().int().min(1).max(5).nullable().optional(), feedbackComment: z.string().max(500).nullable().optional() })), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedTicket(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });

    const roles = getCachedRoles(res);
    const canEdit = hasPermissionForRoleId(roles, req.user!.role, 'tickets:edit');
    const isOwnBu = req.user!.role === 'CUSTOMER' && existing.businessUnit === req.user!.bu;
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
    await audit({ event: 'TICKET_FEEDBACK', ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: AuditAction.TICKET_FEEDBACK, details: `Feedback submitted for ticket ${req.params.id}` });
    res.json(updated);
  });

  router.delete('/tickets/:id', requireAuth, requirePermission('tickets:delete'), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedTicket(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });
    await upsertTicket({ ...existing, isDeleted: true });
    await audit({ event: 'TICKET_DELETED', ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: AuditAction.TICKET_DELETED, details: `Ticket ${req.params.id} soft-deleted` });
    dispatchWebhook('ticket.deleted', { id: req.params.id }).catch(() => {});
    res.json({ ok: true });
  });

  return router;
}