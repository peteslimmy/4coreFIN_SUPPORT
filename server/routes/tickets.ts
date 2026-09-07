import { z } from 'zod';
import { Router, type Response } from 'express';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validateBody';
import { audit, AuditAction } from '../auditEvents';
import { listTickets, getTicket, getScopedTicket, upsertTicket, findOrCreateCustomer, ticketEventFields } from '../repository';
import { tenantIdForBu } from '../tenant';
import { hasPermissionForRoleId, type Permission } from '../rbac';
import { getCachedRoles } from '../middleware/requirePermission';
import { applyTransition, getAvailableTransitions, getTransitionBlockers } from '../../shared/ticketStateMachine';
import {
  STAFF_SUBMITTER_ROLES,
  ticketWatcherRecipients,
  buildTicketId,
  createTicketSchema,
  updateTicketSchema,
} from './ticketHelpers';
import { dispatchWebhook } from '../services/webhookDispatcher';
import { notifyByEmail, appHomeUrl } from '../services/notifyEmails';
import { escapeHtml } from '../lib/htmlSanitize';
import { broadcast } from '../broadcast';
import { TicketStatus, UserRole } from '../../src/types/app';
import { calculateTicketSla } from '../services/ticketService';

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
    // ID generation no longer scans the whole ticket table — an atomic counter
    // (or prefix-bounded fallback) reserves the next sequence. On the rare
    // duplicate-id race (fallback path), retry once with a fresh reservation
    // instead of silently overwriting an existing row.
    let entry: any = { ...ticket, id: ticket.id || (await buildTicketId(ticket.businessUnit)), createdAt: now, createdBy: req.user!.name };
    // Customer identity comes strictly from the request body. For staff
    // submissions, record the officer who logged the complaint so tickets keep
    // the customer (body) and submitter (session) as distinct identities.
    if (STAFF_SUBMITTER_ROLES.includes(req.user!.role)) {
      if (!ticket.submittedBy) entry.submittedBy = 'BU_SUPPORT';
      if (!ticket.submittedByName) entry.submittedByName = req.user!.name;
    }
    const customerId = await findOrCreateCustomer({ email: ticket.customerEmail || '', businessUnit: ticket.businessUnit || (req.user!.role === 'PARTNER' ? req.user!.bu : undefined), name: ticket.customerName || undefined, phone: ticket.customerPhone });
    if (customerId) entry = { ...entry, customerId: customerId.id };
    
    // Calculate SLA deadline if not provided
    if (!entry.slaDeadline && entry.createdAt) {
      const sla = await calculateTicketSla({
        createdAt: new Date(entry.createdAt),
        category: entry.category || '',
        priority: entry.priority || 'LOW',
        partner: entry.partner,
      });
      if (sla) {
        entry.slaDeadline = sla.deadline;
        entry.slaPolicyVersion = sla.policyVersion;
      }
    }
    if (!ticket.id) entry.version = 1;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // expectNew: server-generated ids must collide loudly (unique
        // violation) rather than silently overwriting an existing ticket.
        await upsertTicket(entry, { expectNew: !ticket.id });
        break;
      } catch (e: any) {
        const dup = /duplicate key|unique constraint|already exists/i.test(String(e?.message || ''));
        if (!dup || attempt === 1 || ticket.id) throw e;
        entry = { ...entry, id: await buildTicketId(ticket.businessUnit) };
      }
    }
    broadcast('ticket_created', ticketEventFields(entry), entry.tenantId || tenantIdForBu(entry.businessUnit));
    for (const w of ticketWatcherRecipients(entry.watchers, req.user!.email)) {
      void notifyByEmail(
        w,
        `[4C] New ticket ${escapeHtml(entry.id)}`,
        `<h3>New ticket ${escapeHtml(entry.id)}</h3><p><strong>Business unit:</strong> ${escapeHtml(entry.businessUnit || '—')}</p><p><strong>Category:</strong> ${escapeHtml(entry.category || '—')}</p><p><strong>Priority:</strong> ${escapeHtml(entry.priority || '—')}</p><p>${escapeHtml(entry.description || '')}</p><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`
      );
    }
    res.status(201).json(entry);
    // Audit trail is written off the client's critical path — the response is
    // already flushed; a failed audit log must not fail the created ticket.
    audit({ event: 'TICKET_CREATED', ticketId: entry.id, actor: req.user!.name, role: req.user!.role, action: AuditAction.TICKET_CREATED, details: `Ticket ${entry.id} created` }).catch((err) => req.app?.locals?.logger?.warn?.({ err }, 'audit write failed'));
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
      // Evaluate the machine against the prospective merged record: the client
      // sends required fields (e.g. rcaDetails for RESOLVE) in the same PATCH
      // as the status change. Evaluating against the raw DB row would reject
      // every transition whose required fields are supplied in-band, leaving
      // the server permanently out of sync with the optimistic client state.
      const prospective = { ...existing, ...body };
      const available = getAvailableTransitions(prospective, req.user!.role as UserRole);
      const rule = available.find((r) => r.to === targetStatus);
      if (!rule) {
        const allowed = available.map((r) => ({ to: r.to, label: r.label }));
        return res.status(400).json({ error: `Transition ${existing.status} → ${targetStatus} is not allowed for role ${req.user!.role}`, allowed });
      }
      const blockers = getTransitionBlockers(prospective, rule);
      if (blockers.length > 0) {
        return res.status(400).json({ error: `Transition blocked: ${blockers.join(', ')}`, blockers });
      }
      const mutated = applyTransition(prospective, targetStatus, req.user!.role as UserRole, { actor: req.user!.name });
      const updated = { ...mutated, ...body };
      const cid = await findOrCreateCustomer({ email: existing.customerEmail || '', businessUnit: existing.businessUnit || (req.user!.role === 'PARTNER' ? existing.businessUnit : undefined), name: existing.customerName || undefined });
      if (cid) updated.customerId = cid.id;
      try {
        await upsertTicket(updated, { expectedVersion: typeof (existing as any).version === 'number' ? (existing as any).version : undefined });
      } catch (e: any) {
        if (e?.code === 'CONCURRENT_MODIFICATION') {
          return res.status(409).json({ error: 'Ticket was modified by another user. Reload and retry.', code: 'CONCURRENT_MODIFICATION' });
        }
        throw e;
      }
      const transitionDetails = `Ticket ${req.params.id} transitioned ${existing.status} → ${targetStatus} by ${req.user!.role} via "${rule.label}"`;
      dispatchWebhook('ticket.transitioned', { id: existing.id, from: existing.status, to: targetStatus, actorRole: req.user!.role }).catch(() => {});
      for (const w of ticketWatcherRecipients(existing.watchers, req.user!.email)) {
        void notifyByEmail(
          w,
          `[4C] Ticket ${escapeHtml(req.params.id)} — ${escapeHtml(existing.status)} → ${escapeHtml(targetStatus)}`,
          `<h3>Ticket ${escapeHtml(req.params.id)} updated</h3><p>Status changed from <strong>${escapeHtml(existing.status)}</strong> to <strong>${escapeHtml(targetStatus)}</strong> by ${escapeHtml(req.user!.name)}.</p><p>${escapeHtml(updated.description || '')}</p><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`
        );
      }
      res.json(updated);
      // Off critical path — see POST /tickets.
      audit({ event: 'TICKET_TRANSITION', ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: AuditAction.TICKET_TRANSITION, details: transitionDetails }).catch(() => {});
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
        const sla = await calculateTicketSla({
          createdAt: new Date(existing.createdAt),
          category: existing.category || '',
          priority: 'CRITICAL',
          partner: existing.partner,
          partnerOrgId: existing.partnerOrgId,
        });
        if (sla) body.slaDeadline = sla.deadline;
      }
    }

    if (body.priority && body.priority !== existing.priority && body.priority !== 'CRITICAL') {
      if (existing.createdAt) {
        const sla = await calculateTicketSla({
          createdAt: new Date(existing.createdAt),
          category: existing.category || '',
          priority: body.priority,
          partner: existing.partner,
          partnerOrgId: existing.partnerOrgId,
        });
        if (sla) body.slaDeadline = sla.deadline;
      }
    }

    if (body.duplicateOf !== undefined && body.duplicateOf !== existing.duplicateOf) {
      if (!feat('tickets:merge')) {
        return res.status(403).json({ error: 'Requires permission: tickets:merge' });
      }
    }

    const updated = { ...existing, ...body };
    delete (updated as any).version;
    const cid2 = await findOrCreateCustomer({ email: existing.customerEmail || '', businessUnit: existing.businessUnit || (req.user!.role === 'PARTNER' ? existing.businessUnit : undefined), name: existing.customerName || undefined });
    if (cid2) updated.customerId = cid2.id;
    try {
      await upsertTicket(updated, { expectedVersion: typeof (existing as any).version === 'number' ? (existing as any).version : undefined });
    } catch (e: any) {
      if (e?.code === 'CONCURRENT_MODIFICATION') {
        return res.status(409).json({ error: 'Ticket was modified by another user. Reload and retry.', code: 'CONCURRENT_MODIFICATION' });
      }
      throw e;
    }
    res.json(updated);
    // Off critical path — see POST /tickets.
    audit({ event: 'TICKET_UPDATED', ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: AuditAction.TICKET_UPDATED, details: `Ticket ${req.params.id} patched` }).catch(() => {});
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
    res.json(updated);
    // Off critical path — see POST /tickets.
    audit({ event: 'TICKET_FEEDBACK', ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: AuditAction.TICKET_FEEDBACK, details: `Feedback submitted for ticket ${req.params.id}` }).catch(() => {});
  });

  router.delete('/tickets/:id', requireAuth, requirePermission('tickets:delete'), async (req: AuthedRequest, res: Response) => {
    const existing = await getScopedTicket(req.params.id, req.user!);
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });
    await upsertTicket({ ...existing, isDeleted: true });
    dispatchWebhook('ticket.deleted', { id: req.params.id }).catch(() => {});
    broadcast('ticket_deleted', { id: req.params.id }, existing.tenantId || null);
    res.json({ ok: true });
    // Off critical path — see POST /tickets.
    audit({ event: 'TICKET_DELETED', ticketId: req.params.id, actor: req.user!.name, role: req.user!.role, action: AuditAction.TICKET_DELETED, details: `Ticket ${req.params.id} soft-deleted` }).catch(() => {});
  });

  return router;
}
