import { NextRequest, NextResponse } from 'next/server';
import { hasPermissionForRoleId, getRoles, type Permission } from '../../../../shared/rbac';
import { getConfig, listTickets, upsertTicket, findOrCreateCustomer } from '../../../../server/repository';
import { tenantIdForBu } from '../../../../server/tenant';
import { ticketWatcherRecipients, buildTicketId, createTicketSchema } from '../../../../server/routes/ticketHelpers';
import { calculateTicketSla } from '../../../../server/services/ticketService';
import { dispatchWebhook } from '../../../../server/services/webhookDispatcher';
import { notifyByEmail, appHomeUrl } from '../../../../server/services/notifyEmails';
import { escapeHtml } from '../../../../server/lib/htmlSanitize';
import { broadcast } from '../../../../server/broadcast';
import { ticketEventFields } from '../../../../server/repository';
import { audit, AuditAction } from '../../../../server/auditEvents';
import { guardRequest } from '../../../../lib/server/apiContext';

export async function GET(req: NextRequest) {
  const guard = await guardRequest(req, 'tickets:view');
  if (guard instanceof NextResponse) return guard;
  const { user } = guard.session;

  const sp = req.nextUrl.searchParams;
  const wantsUnmask = sp.get('unmask') === 'true';
  const raw = await getConfig<import('../../../../shared/rbac').RoleDefinition[]>('roles', []);
  const canUnmask = hasPermissionForRoleId(getRoles(raw), user.role, 'tickets:unmask' as Permission);
  if (wantsUnmask && !canUnmask) {
    return NextResponse.json({ error: 'Requires permission: tickets:unmask' }, { status: 403 });
  }

  const limit = sp.get('limit') ? Math.min(Number(sp.get('limit')) || 20, 200) : undefined;
  const offset = sp.get('offset') ? Math.max(Number(sp.get('offset')) || 0, 0) : undefined;
  const tickets = await listTickets(user, {
    includeDeleted: sp.get('includeDeleted') === 'true',
    unmask: wantsUnmask && canUnmask,
    limit,
    offset,
    status: sp.get('status') || undefined,
    priority: sp.get('priority') || undefined,
    businessUnit: sp.get('businessUnit') || undefined,
    partner: sp.get('partner') || undefined,
    search: sp.get('search') || undefined,
  });
  const total = tickets.length > 0 ? (tickets[0] as any)._totalCount ?? tickets.length : 0;
  const paging = limit ? { limit, offset: offset ?? 0, total } : undefined;
  return NextResponse.json(paging ? { tickets, ...paging } : tickets);
}

export async function POST(req: NextRequest) {
  const guard = await guardRequest(req, 'tickets:create');
  if (guard instanceof NextResponse) return guard;
  const { user } = guard.session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = createTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const ticket = parsed.data as any;

  if (user.role !== 'SUPER_ADMIN' && user.role !== 'EXECUTIVE' && user.bu !== 'ALL') {
    if (tenantIdForBu(ticket.businessUnit) !== (user.tenantId || '')) {
      return NextResponse.json({ error: 'Cannot create a ticket outside your business unit' }, { status: 403 });
    }
  }

  const now = new Date().toISOString();
  let entry: any = { ...ticket, id: ticket.id || (await buildTicketId(ticket.businessUnit)), createdAt: now, createdBy: user.name };
  if (ticket.businessUnit) entry.tenantId = tenantIdForBu(ticket.businessUnit);
  if (!ticket.id) entry.version = 1;
  const customerId = await findOrCreateCustomer({ email: ticket.customerEmail || '', businessUnit: ticket.businessUnit || (user.role === 'PARTNER' ? user.bu : undefined), name: ticket.customerName || undefined, phone: ticket.customerPhone });
  if (customerId) entry = { ...entry, customerId: customerId.id };

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

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await upsertTicket(entry, { expectNew: !ticket.id });
      break;
    } catch (e: any) {
      const dup = /duplicate key|unique constraint|already exists/i.test(String(e?.message || ''));
      if (!dup || attempt === 1 || ticket.id) throw e;
      entry = { ...entry, id: await buildTicketId(ticket.businessUnit) };
    }
  }

  broadcast('ticket_created', ticketEventFields(entry), entry.tenantId || tenantIdForBu(entry.businessUnit));
  for (const w of ticketWatcherRecipients(entry.watchers, user.email)) {
    void notifyByEmail(
      w,
      `[4C] New ticket ${escapeHtml(entry.id)}`,
      `<h3>New ticket ${escapeHtml(entry.id)}</h3><p><strong>Business unit:</strong> ${escapeHtml(entry.businessUnit || '—')}</p><p><strong>Category:</strong> ${escapeHtml(entry.category || '—')}</p><p><strong>Priority:</strong> ${escapeHtml(entry.priority || '—')}</p><p>${escapeHtml(entry.description || '')}</p><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`
    );
  }

  audit({ event: 'TICKET_CREATED', ticketId: entry.id, actor: user.name, role: user.role, action: AuditAction.TICKET_CREATED, details: `Ticket ${entry.id} created` }).catch(() => {});
  return NextResponse.json(entry, { status: 201 });
}
