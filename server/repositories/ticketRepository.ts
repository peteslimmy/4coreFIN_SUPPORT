import { supabase } from '../supabase';
import { type AuthUser, applyTicketMasking } from '../compliance';
import { canAccessTicket } from '../auth';
import { broadcast } from '../broadcast';
import { dispatchWebhook } from '../services/webhookDispatcher';
import { encrypt } from '../services/encryptionService';
import { escapeLike } from '../lib/escapeLike';
import {
  tenantScope,
  isPartner,
  scopeTicketsToPartner,
  toCamel,
  toSnake,
  tryDecrypt,
  ensureTenantForBu,
  resolvePartnerOrgId,
} from './shared';

// ─── Tickets ───────────────────────────────────────────────────────────

export async function listTickets(
  user: AuthUser,
  opts?: {
    includeDeleted?: boolean;
    unmask?: boolean;
    limit?: number;
    offset?: number;
    status?: string;
    priority?: string;
    businessUnit?: string;
    partner?: string;
    search?: string;
  }
): Promise<any[]> {
  let query = supabase.from('tickets').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (!opts?.includeDeleted) {
    query = query.eq('is_deleted', false);
  }
  if (opts?.status) {
    query = query.eq('status', opts.status);
  }
  if (opts?.priority) {
    query = query.eq('priority', opts.priority);
  }
  if (opts?.businessUnit) {
    query = query.eq('business_unit', opts.businessUnit);
  }
  if (opts?.partner) {
    query = query.ilike('partner', `%${escapeLike(opts.partner)}%`);
  }
  if (opts?.search) {
    const term = `%${escapeLike(opts.search)}%`;
    query = query.or(`customer_name.ilike.${term},description.ilike.${term},id.ilike.${term}`);
  }
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isPartner(user)) {
    query = scopeTicketsToPartner(query, user);
  }
  if (opts?.limit) {
    query = query.range(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit - 1);
  } else {
    query = query.range(0, 499);
  }
  const { data, error, count } = await query;
  if (error || !data) return [];
  const rows = data as any[];
  const total = typeof count === 'number' ? count : rows.length;
  const mapped = rows
    .map(toCamel)
    .map((t) => ({
      ...t,
      customerEmail: tryDecrypt(t.customerEmail),
      customerPhone: tryDecrypt(t.customerPhone),
      cardPan: tryDecrypt(t.cardPan),
      submittedByPhone: tryDecrypt(t.submittedByPhone),
    } as Record<string, any>))
    .filter((t) => canAccessTicket(user, t))
    .map((t) => applyTicketMasking(t, user, !!opts?.unmask));
  for (const t of mapped) { (t as any)._totalCount = total; }
  return mapped;
}

export async function getTicketRaw(id: string): Promise<any | null> {
  const { data, error } = await supabase.from('tickets').select('*').eq('id', id).single();
  if (error || !data) return null;
  return toCamel(data);
}

/**
 * Load a single ticket enforcing the authenticated user's scope at the query
 * level. Returns null when the ticket is not in the user's scope.
 */
export async function getScopedTicket(id: string, user: AuthUser): Promise<any | null> {
  let query = supabase.from('tickets').select('*').eq('id', id);
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isPartner(user)) {
    query = scopeTicketsToPartner(query, user);
  }
  const { data, error } = await query.single();
  if (error || !data) return null;
  let ticket = toCamel(data);
  // Decrypt PII fields so the app sees plaintext; compliance masking is applied separately.
  ticket = {
    ...ticket,
    customerEmail: tryDecrypt(ticket.customerEmail),
    customerPhone: tryDecrypt(ticket.customerPhone),
    cardPan: tryDecrypt(ticket.cardPan),
    submittedByPhone: tryDecrypt(ticket.submittedByPhone),
  };
  if (!canAccessTicket(user, ticket)) return null;
  return ticket;
}

export async function getTicket(id: string, user: AuthUser, unmask = false): Promise<any | null> {
  const ticket = await getScopedTicket(id, user);
  if (!ticket) return null;
  return applyTicketMasking(ticket, user, unmask);
}

/**
 * Non-PII subset of a ticket that is safe to broadcast to realtime clients.
 * PII (customerEmail/customerPhone/cardPan/submittedByPhone) is encrypted at
 * rest and must never leave the server through an event payload; viewers read
 * those fields through the normal getTicket/listTickets masking path instead.
 */
export function ticketEventFields(ticket: any): Record<string, unknown> {
  return {
    id: ticket.id,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    businessUnit: ticket.businessUnit,
    partner: ticket.partner,
    createdAt: ticket.createdAt,
    customerName: ticket.customerName || '',
    customerId: ticket.customerId || null,
    amount: ticket.amount,
    transactionId: ticket.transactionId || '',
    bankName: ticket.bankName || '',
    description: ticket.description || '',
    slaDeadline: ticket.slaDeadline,
    slaPausedMs: ticket.slaPausedMs || 0,
    slaPauseStartedAt: ticket.slaPauseStartedAt || null,
    isEscalated: !!ticket.isEscalated,
    escalationCount: ticket.escalationCount || 0,
    assignedAgentId: ticket.assignedAgentId || '',
    majorIncidentId: ticket.majorIncidentId || null,
    feedbackScore: ticket.feedbackScore ?? null,
    feedbackComment: ticket.feedbackComment || null,
    rootCause: ticket.rootCause || null,
    correctiveAction: ticket.correctiveAction || null,
    submittedBy: ticket.submittedBy || 'BU_SUPPORT',
    submittedByName: ticket.submittedByName || '',
    isDeleted: !!ticket.isDeleted,
    watchers: ticket.watchers || [],
    duplicateOf: ticket.duplicateOf || null,
  };
}

export async function upsertTicket(ticket: any, opts?: { expectedVersion?: number; expectNew?: boolean }) {
  // Encrypt PII at rest before persisting. The encrypted format is
  // iv:tag:cipherhex; Supabase stores it as text, and read paths will
  // decrypt after fetch so the app always sees unmasked plaintext.
  const enc = (v: string | undefined | null) => v ? encrypt(String(v)) : '';

  const tenantId = ticket.tenantId || (await ensureTenantForBu(ticket.businessUnit));
  // Resolve the partner organization FK (stamps partner_org_id on write).
  const partnerOrgId = ticket.partnerOrgId ?? (ticket.partner ? await resolvePartnerOrgId(ticket.partner) : null);
  const row = toSnake({
    id: ticket.id,
    customerName: ticket.customerName || '',
    customerEmail: enc(ticket.customerEmail),
    customerPhone: enc(ticket.customerPhone),
    customerLastName: ticket.customerLastName || '',
    customerId: ticket.customerId || null,
    businessUnit: ticket.businessUnit,
    tenantId,
    partner: ticket.partner || '',
    partnerOrgId,
    category: ticket.category,
    issueType: ticket.category || '',
    priority: ticket.priority,
    status: ticket.status,
    amount: ticket.amount || 0,
    transactionId: ticket.transactionId || '',
    cardPan: enc(ticket.cardPan),
    bankName: ticket.bankName || '',
    description: ticket.description || '',
    createdAt: ticket.createdAt,
    slaDeadline: ticket.slaDeadline,
    slaPausedMs: ticket.slaPausedMs || 0,
    slaPauseStartedAt: ticket.slaPauseStartedAt || null,
    isEscalated: !!ticket.isEscalated,
    escalationCount: ticket.escalationCount || 0,
    assignedAgentId: ticket.assignedAgentId || '',
    majorIncidentId: ticket.majorIncidentId || null,
    feedbackScore: ticket.feedbackScore ?? null,
    feedbackComment: ticket.feedbackComment || null,
    rootCause: ticket.rootCause || null,
    correctiveAction: ticket.correctiveAction || null,
    submittedBy: ticket.submittedBy || 'BU_SUPPORT',
    submittedByName: ticket.submittedByName || '',
    submittedByPhone: enc(ticket.submittedByPhone),
    isDeleted: !!ticket.isDeleted,
    watchers: ticket.watchers || [],
    rcaDetails: ticket.rcaDetails || null,
    customFields: ticket.customFields || {},
    duplicateOf: ticket.duplicateOf || null,
    // CAS writes bump the version; plain upserts preserve whatever the caller
    // carries (soft-delete re-upserts an existing row) or default to 1 on create.
    version:
      opts?.expectedVersion !== undefined && opts.expectedVersion > 0
        ? opts.expectedVersion + 1
        : (typeof ticket.version === 'number' && ticket.version > 0 ? ticket.version : 1),
  });

  if (opts?.expectedVersion !== undefined && opts.expectedVersion > 0) {
    // Optimistic concurrency control: only write when the row still carries
    // the version the caller read. A concurrent PATCH between read and write
    // makes the WHERE clause match zero rows instead of silently overwriting.
    const { data, error } = await supabase
      .from('tickets')
      .update(row)
      .eq('id', row.id)
      .eq('version', opts.expectedVersion)
      .select('id');
    if (error) throw new Error(`upsertTicket failed: ${error.message}`);
    if (!data || data.length === 0) {
      const err: any = new Error('Ticket was modified by another user. Reload and retry.');
      err.code = 'CONCURRENT_MODIFICATION';
      throw err;
    }
  } else if (opts?.expectNew) {
    // Server-generated ids on the creation path must fail loudly on a
    // duplicate instead of silently overwriting an existing ticket via
    // upsert. Callers catch the unique-violation and reserve a new id.
    const { error } = await supabase.from('tickets').insert(row);
    if (error) throw new Error(`upsertTicket failed: ${error.message}`);
  } else {
    const { error } = await supabase.from('tickets').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`upsertTicket failed: ${error.message}`);
  }
  broadcast('ticket_updated', ticketEventFields(ticket), row.tenant_id);

  // Keep the customer's total_tickets counter in sync with live ticket state.
  if (ticket.customerId) {
    await recalcCustomerTotalTickets(ticket.customerId);
  }

  dispatchWebhook('ticket.updated', { id: ticket.id, status: ticket.status, priority: ticket.priority }).catch(() => {});
}

/**
 * Atomically reserve the next sequence number for a BU-prefixed ticket id.
 * Uses the next_ticket_id_sequence RPC (single-statement upsert-and-return),
 * making concurrent creations collision-free. Returns null when the RPC is
 * unavailable so callers can fall back to the legacy prefix-scan computation.
 */
export async function nextTicketSequence(buCode: string, dateKey: string): Promise<number | null> {
  try {
    const { data, error } = await (supabase as any).rpc('next_ticket_id_sequence', {
      p_bu_code: buCode,
      p_date_key: dateKey,
    });
    if (!error && typeof data === 'number' && Number.isFinite(data) && data > 0) return data;
  } catch {
    // RPC missing (migration not yet applied / fake client in tests) — fall back.
  }
  return null;
}

export async function recalcCustomerTotalTickets(customerId: string): Promise<void> {
  // customer_email is encrypted per-row (migration 031) so plaintext equality
  // never matches; count by the reliable customer_id join key only.
  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('is_deleted', false);
  if (error) {
    console.error('recalcCustomerTotalTickets failed:', error.message);
    return;
  }
  const total = typeof count === 'number' ? count : 0;
  const { error: updErr } = await supabase.from('customers').update({ total_tickets: total }).eq('id', customerId);
  if (updErr) console.error('recalcCustomerTotalTickets failed:', updErr.message);
}

/**
 * Lightweight facet counts for the executive dashboard. Projects only the
 * three grouping columns (no PII decryption, no JSONB payload) instead of
 * hydrating every ticket through listTickets. Intended for global-visibility
 * roles only (executive:dashboard gate).
 */
export async function ticketFacetCounts(): Promise<{
  byBu: Record<string, number>;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}> {
  const out = {
    byBu: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
  };
  const { data, error } = await supabase
    .from('tickets')
    .select('business_unit, status, priority')
    .eq('is_deleted', false);
  if (error || !data) return out;
  const bump = (m: Record<string, number>, key?: string | null) => {
    if (!key) return;
    m[key] = (m[key] || 0) + 1;
  };
  for (const row of data as any[]) {
    bump(out.byBu, row.business_unit);
    bump(out.byStatus, row.status);
    bump(out.byPriority, row.priority);
  }
  return out;
}

// ─── SLA ───────────────────────────────────────────────────────────────

export async function openTicketsForSla() {
  // Waiting tickets have their SLA clock paused (migration 048) — the monitor
  // skips them entirely; breach/at-risk evaluation resumes when they leave the
  // waiting state. Only the columns the monitor reads are fetched.
  const { data, error } = await supabase
    .from('tickets')
    .select('id, tenant_id, partner, category, priority, status, is_escalated, sla_deadline, sla_paused_ms, sla_pause_started_at, watchers, assigned_agent_id')
    .eq('is_deleted', false)
    .not('status', 'in', '(CLOSED,RESOLVED,WAITING_CUSTOMER,WAITING_PARTNER,WAITING_INTERNAL)');
  if (error || !data) return [];
  return data.map(toCamel);
}
