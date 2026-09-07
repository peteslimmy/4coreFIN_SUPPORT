import { NextRequest, NextResponse } from 'next/server';
import { hasPermissionForRoleId, getRoles } from '../../../../../shared/rbac';
import { getTicket, getScopedTicket, upsertTicket, findOrCreateCustomer } from '../../../../../server/repository';
import { getConfig } from '../../../../../server/repository';
import { updateTicketSchema, ticketWatcherRecipients } from '../../../../../server/routes/ticketHelpers';
import { calculateTicketSla } from '../../../../../server/services/ticketService';
import { dispatchWebhook } from '../../../../../server/services/webhookDispatcher';
import { notifyByEmail, appHomeUrl } from '../../../../../server/services/notifyEmails';
import { escapeHtml } from '../../../../../server/lib/htmlSanitize';
import { broadcast } from '../../../../../server/broadcast';
import { audit, AuditAction } from '../../../../../server/auditEvents';
import { guardRequest, containsMaskedValue } from '../../../../../lib/server/apiContext';
import {
  applyTransition,
  getAvailableTransitions,
  getTransitionBlockers,
} from '../../../../../shared/ticketStateMachine';
import type { UserRole } from '../../../../../src/types/app';

/** Fields a partner may patch: RCA/case-handling only. Customer identity,
 *  financial evidence (amount, transactionId, cardPan) and routing fields
 *  (businessUnit) are BU-side data (audit fix: field-level allowlist). */
const PARTNER_PATCHABLE_FIELDS = new Set([
  'rcaDetails', 'rootCause', 'correctiveAction', 'watchers', 'customFields',
]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardRequest(req, 'tickets:view');
  if (guard instanceof NextResponse) return guard;
  const { user } = guard.session;
  const { id } = await ctx.params;

  const wantsUnmask = req.nextUrl.searchParams.get('unmask') === 'true';
  const raw = await getConfig<import('../../../../../shared/rbac').RoleDefinition[]>('roles', []);
  const canUnmask = hasPermissionForRoleId(getRoles(raw), user.role, 'tickets:unmask');
  if (wantsUnmask && !canUnmask) {
    return NextResponse.json({ error: 'Requires permission: tickets:unmask' }, { status: 403 });
  }
  const ticket = await getTicket(id, user, wantsUnmask && canUnmask);
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  return NextResponse.json(ticket);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardRequest(req, 'tickets:edit');
  if (guard instanceof NextResponse) return guard;
  const user = guard.session.user;
  const { id } = await ctx.params;

  const existing = await getScopedTicket(id, user);
  if (!existing) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = updateTicketSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const body: any = { ...parsed.data };
  for (const field of ['id', 'createdAt', 'createdBy', 'tenantId', 'tenant_id', 'created_at', 'majorIncidentId']) {
    delete body[field];
  }

  // ── Audit fix 1: field-level allowlist ──
  if (user.role === 'PARTNER') {
    const denied = Object.keys(body).filter((k) => !PARTNER_PATCHABLE_FIELDS.has(k) && k !== 'to' && k !== 'status');
    if (denied.length > 0) {
      return NextResponse.json(
        { error: `Partners may only update case-handling fields. Denied: ${denied.join(', ')}` },
        { status: 403 }
      );
    }
  }

  // ── Audit fix 2: masked-PII round-trip rejection ──
  const piiFields = ['customerEmail', 'customerPhone', 'cardPan', 'transactionId', 'customerName'];
  for (const f of piiFields) {
    if (containsMaskedValue(body[f])) {
      return NextResponse.json(
        { error: `Cannot save masked value for ${f}. Unmask the ticket before editing this field.` },
        { status: 400 }
      );
    }
  }

  const raw = await getConfig<import('../../../../../shared/rbac').RoleDefinition[]>('roles', []);
  const roles = getRoles(raw);
  const feat = (p: string) => hasPermissionForRoleId(roles, user.role, p as any);

  // ── Status changes go through the state machine ──
  const targetStatus = (body.to ?? body.status) as string | undefined;
  delete body.to;
  delete body.status;

  if (targetStatus !== undefined && targetStatus !== existing.status) {
    const prospective = { ...existing, ...body };
    const available = getAvailableTransitions(prospective, user.role as UserRole);
    const rule = available.find((r) => r.to === targetStatus);
    if (!rule) {
      const allowed = available.map((r) => ({ to: r.to, label: r.label }));
      return NextResponse.json(
        { error: `Transition ${existing.status} → ${targetStatus} is not allowed for role ${user.role}`, allowed },
        { status: 400 }
      );
    }
    const blockers = getTransitionBlockers(prospective, rule);
    if (blockers.length > 0) {
      return NextResponse.json({ error: `Transition blocked: ${blockers.join(', ')}`, blockers }, { status: 400 });
    }
    const mutated = applyTransition(prospective, targetStatus as any, user.role as UserRole, { actor: user.name });
    const updated = { ...mutated, ...body };
    const cid = await findOrCreateCustomer({ email: existing.customerEmail || '', businessUnit: existing.businessUnit || (user.role === 'PARTNER' ? existing.businessUnit : undefined), name: existing.customerName || undefined });
    if (cid) updated.customerId = cid.id;
    try {
      await upsertTicket(updated, {
        expectedVersion: typeof (existing as any).version === 'number' ? (existing as any).version : undefined,
      });
    } catch (e: any) {
      if (e?.code === 'CONCURRENT_MODIFICATION') {
        return NextResponse.json({ error: 'Ticket was modified by another user. Reload and retry.', code: 'CONCURRENT_MODIFICATION' }, { status: 409 });
      }
      throw e;
    }
    dispatchWebhook('ticket.transitioned', { id: existing.id, from: existing.status, to: targetStatus, actorRole: user.role }).catch(() => {});
    for (const w of ticketWatcherRecipients(existing.watchers, user.email)) {
      void notifyByEmail(
        w,
        `[4C] Ticket ${escapeHtml(String(id))} — ${escapeHtml(existing.status)} → ${escapeHtml(targetStatus)}`,
        `<h3>Ticket ${escapeHtml(String(id))} updated</h3><p>Status changed from <strong>${escapeHtml(existing.status)}</strong> to <strong>${escapeHtml(targetStatus)}</strong> by ${escapeHtml(user.name)}.</p><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`
      );
    }
    audit({ event: 'TICKET_TRANSITION', ticketId: id, actor: user.name, role: user.role, action: AuditAction.TICKET_TRANSITION, details: `Ticket ${id} transitioned ${existing.status} → ${targetStatus} by ${user.role} via "${rule.label}"` }).catch(() => {});
    return NextResponse.json(updated);
  }

  // ── Audit fix 3: escalation is a real, reason-mandated action ──
  delete body.escalationCount;
  if (body.isEscalated !== undefined && body.isEscalated !== existing.isEscalated) {
    if (!feat('tickets:escalate')) {
      return NextResponse.json({ error: 'Requires permission: tickets:escalate' }, { status: 403 });
    }
    if (body.isEscalated === true) {
      const reason = typeof rawBody.escalationReason === 'string' ? rawBody.escalationReason.trim() : '';
      if (reason.length < 10) {
        return NextResponse.json(
          { error: 'A mandatory escalation reason (min 10 characters) is required and will be recorded in the compliance audit trail.' },
          { status: 400 }
        );
      }
      body.escalationReason = reason;
      body.escalatedBy = user.name;
      body.escalatedAt = new Date().toISOString();
      body.escalationCount = (existing.escalationCount || 0) + 1;
    }
  }

  if (body.priority === 'CRITICAL' && existing.priority !== 'CRITICAL') {
    if (!feat('tickets:escalate')) {
      return NextResponse.json({ error: 'Requires permission: tickets:escalate' }, { status: 403 });
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
      return NextResponse.json({ error: 'Requires permission: tickets:merge' }, { status: 403 });
    }
  }

  const updated = { ...existing, ...body };
  delete (updated as any).version;
  const cid2 = await findOrCreateCustomer({ email: existing.customerEmail || '', businessUnit: existing.businessUnit || (user.role === 'PARTNER' ? existing.businessUnit : undefined), name: existing.customerName || undefined });
  if (cid2) updated.customerId = cid2.id;
  try {
    await upsertTicket(updated, {
      expectedVersion: typeof (existing as any).version === 'number' ? (existing as any).version : undefined,
    });
  } catch (e: any) {
    if (e?.code === 'CONCURRENT_MODIFICATION') {
      return NextResponse.json({ error: 'Ticket was modified by another user. Reload and retry.', code: 'CONCURRENT_MODIFICATION' }, { status: 409 });
    }
    throw e;
  }
  broadcast('ticket_updated', { id }, existing.tenantId || null);
  audit({ event: 'TICKET_UPDATED', ticketId: id, actor: user.name, role: user.role, action: AuditAction.TICKET_UPDATED, details: body.escalationReason ? `Ticket ${id} escalated by ${user.name}: ${body.escalationReason}` : `Ticket ${id} patched` }).catch(() => {});
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardRequest(req, 'tickets:delete');
  if (guard instanceof NextResponse) return guard;
  const user = guard.session.user;
  const { id } = await ctx.params;

  const existing = await getScopedTicket(id, user);
  if (!existing) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  // ── Audit fix 4: soft-delete now honors optimistic concurrency ──
  try {
    await upsertTicket(
      { ...existing, isDeleted: true },
      { expectedVersion: typeof (existing as any).version === 'number' ? (existing as any).version : undefined }
    );
  } catch (e: any) {
    if (e?.code === 'CONCURRENT_MODIFICATION') {
      return NextResponse.json({ error: 'Ticket was modified by another user. Reload and retry.', code: 'CONCURRENT_MODIFICATION' }, { status: 409 });
    }
    throw e;
  }
  dispatchWebhook('ticket.deleted', { id }).catch(() => {});
  broadcast('ticket_deleted', { id }, existing.tenantId || null);
  audit({ event: 'TICKET_DELETED', ticketId: id, actor: user.name, role: user.role, action: AuditAction.TICKET_DELETED, details: `Ticket ${id} soft-deleted` }).catch(() => {});
  return NextResponse.json({ ok: true });
}
