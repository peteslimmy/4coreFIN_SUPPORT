import { supabase } from './supabase';
import { computeAuditHash, type AuditEntry, type AuthUser, applyTicketMasking } from './compliance';
import { encrypt, decrypt } from './services/encryptionService';
import { canAccessTicket } from './auth';
import { tenantIdForBu, GLOBAL_TENANT_ID } from './tenant';
import { broadcast } from './broadcast';
import { dispatchWebhook } from './services/webhookDispatcher';
import { buildId } from './lib/ids';
import { escapeLike } from './lib/escapeLike';
import { refreshSignedUrls } from './services/storageService';

// ─── Tenant scoping helpers ────────────────────────────────────────────

/**
 * Return the tenant id that a user is restricted to, or null when the user
 * may read across all tenants (SUPER_ADMIN / EXECUTIVE / bu === 'ALL').
 * PARTNER is scoped by partner name, not tenant (handled separately).
 */
export function tenantScope(user: AuthUser): string | null {
  if (user.role === 'SUPER_ADMIN' || user.role === 'EXECUTIVE') return null;
  if (user.bu === 'ALL') return null;
  if (isPartner(user)) return null;
  return user.tenantId || '';
}

function isPartner(user: AuthUser): boolean {
  return user.role === 'PARTNER';
}

/** The payment-partner name for an account, from the partner column or legacy `bu`. */
export function partnerNameFor(user: AuthUser): string {
  return (user.partner || user.bu || '').toLowerCase();
}

/**
 * Apply partner scoping to a ticket query. Prefers the partner_org_id FK
 * (migration 044) and falls back to case-insensitive name matching for rows
 * or accounts that have not been migrated yet. Returns the query for chaining.
 */
function scopeTicketsToPartner(query: any, user: AuthUser) {
  if (user.partnerOrgId != null) {
    return query.eq('partner_org_id', user.partnerOrgId);
  }
  return query.ilike('partner', partnerNameFor(user));
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** Convert snake_case DB row to camelCase for frontend compatibility */
function toCamel(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = value;
  }
  return result;
}

/** Convert camelCase frontend object to snake_case for Supabase */
function toSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snake = key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    result[snake] = value;
  }
  return result;
}

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
function tryDecrypt(encryptedText: string | null | undefined): string {
  if (!encryptedText) return '';
  try {
    const result = decrypt(encryptedText);
    return result === encryptedText ? '' : result;
  } catch {
    return '';
  }
}

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

// ─── Partner organization resolution ───────────────────────────────────

// TTL-bounded cache (previously unbounded — a slow memory leak). Entries
// expire after 10 minutes and the map is capped so pathological partner-name
// churn cannot grow the heap without limit.
const PARTNER_ORG_CACHE_TTL_MS = 10 * 60_000;
const PARTNER_ORG_CACHE_MAX = 1_000;
const partnerOrgIdCache = new Map<string, { id: number | null; expiresAt: number }>();

/** Look up (and cache) the partner_organizations id for a partner name. */
export async function resolvePartnerOrgId(partner: string): Promise<number | null> {
  const name = String(partner || '').trim().toLowerCase();
  if (!name) return null;
  const cached = partnerOrgIdCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.id;
  const { data } = await supabase
    .from('partner_organizations')
    .select('id')
    .ilike('name', name)
    .maybeSingle();
  const id = (data?.id as number | undefined) ?? null;
  if (partnerOrgIdCache.size >= PARTNER_ORG_CACHE_MAX) {
    // Drop expired entries first, then evict oldest-inserted as a fallback.
    const now = Date.now();
    for (const [k, v] of partnerOrgIdCache) {
      if (v.expiresAt <= now) partnerOrgIdCache.delete(k);
    }
    while (partnerOrgIdCache.size >= PARTNER_ORG_CACHE_MAX) {
      const oldest = partnerOrgIdCache.keys().next().value;
      if (oldest === undefined) break;
      partnerOrgIdCache.delete(oldest);
    }
  }
  partnerOrgIdCache.set(name, { id, expiresAt: Date.now() + PARTNER_ORG_CACHE_TTL_MS });
  return id;
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

// ─── Comments ──────────────────────────────────────────────────────────

/** Normalize a comment row's seenBy to always be an array (JSONB may hold a
 * string literal like "[]" from older seeds). */
function normalizeComment(comment: Record<string, any>): Record<string, any> {
  const seenBy = comment.seenBy;
  return { ...comment, seenBy: Array.isArray(seenBy) ? seenBy : [] };
}

export async function listComments(ticketIds?: string[], user?: AuthUser, limit?: number) {
  let query = supabase.from('comments').select('*').order('timestamp', { ascending: false });
  if (ticketIds && ticketIds.length > 0) {
    query = query.in('ticket_id', ticketIds);
  }
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  // Bound the result set for bulk consumers (bootstrap); per-ticket callers
  // pass no limit and rely on the ticket filter.
  if (limit && limit > 0) query = query.limit(limit);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((c) => normalizeComment(toCamel(c)));
}

export async function insertComment(comment: any) {
  const row = toSnake({
    id: comment.id,
    ticketId: comment.ticketId,
    tenantId: comment.tenantId || (await ticketTenantId(comment.ticketId)),
    author: comment.author,
    authorEmail: comment.authorEmail || '',
    role: comment.role,
    message: comment.message,
    timestamp: comment.timestamp,
    isInternal: comment.isInternal || false,
    seen: comment.seen || false,
    parentCommentId: comment.parentCommentId || null,
    seenBy: comment.seenBy || [],
  });
  const { error } = await supabase.from('comments').insert(row);
  if (error) throw new Error(`insertComment failed: ${error.message}`);
  broadcast('comment_added', comment, row.tenant_id);
}

export async function updateComment(comment: any) {
  const row = toSnake({
    message: comment.message,
    timestamp: comment.timestamp,
    seen: comment.seen,
    isInternal: comment.isInternal,
    seenBy: comment.seenBy,
  });
  const { error } = await supabase.from('comments').update(row).eq('id', comment.id);
  if (error) throw new Error(`updateComment failed: ${error.message}`);
}

/** Load a single comment enforcing the user's scope (tenant + ticket access). */
export async function getScopedComment(id: string, user: AuthUser): Promise<any | null> {
  let query = supabase.from('comments').select('*').eq('id', id);
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  const { data, error } = await query.single();
  if (error || !data) return null;
  const comment = normalizeComment(toCamel(data));
  if (!comment.ticketId) return null;
  const ticket = await getScopedTicket(comment.ticketId, user);
  if (!ticket) return null;
  return comment;
}

// ─── Audit Logs ────────────────────────────────────────────────────────

/** Resolve the tenant id a ticket belongs to, or the global tenant. */
async function ticketTenantId(ticketId: string | null | undefined): Promise<string> {
  if (!ticketId) return GLOBAL_TENANT_ID;
  const { data } = await supabase.from('tickets').select('tenant_id').eq('id', ticketId).single();
  return data?.tenant_id || GLOBAL_TENANT_ID;
}

export async function getLatestAuditHash(): Promise<string> {
  const { data } = await supabase
    .from('audit_logs')
    .select('hash')
    .order('timestamp', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .single();
  return data?.hash || '';
}

// Audit writes are hash-chained (each entry embeds the previous entry's
// hash), so they must be strictly serialized. Callers increasingly invoke
// audit() off the response critical path; without a queue, two concurrent
// writes could both observe the same previousHash and fork the chain.
// The in-process promise chain guarantees process-wide FIFO ordering and is
// failure-tolerant: one failed write does not block subsequent entries.
//
// KNOWN LIMITATION (multi-process deployments): this queue serializes writes
// only within a single Node.js process. Under PM2 cluster / multi-pod
// deployments, two instances appending simultaneously can both read the same
// previousHash and fork the chain. verifyAuditChainPaged() detects the fork,
// but prevention requires a DB-level advisory lock or chain constraint
// (planned migration). Single-process deployment is the supported mode.
let auditQueue: Promise<unknown> = Promise.resolve();

export function appendAuditLog(input: {
  ticketId: string | null;
  actor: string;
  role: string;
  action: string;
  details: string;
  event?: string | null;
}): Promise<AuditEntry> {
  const run = async (): Promise<AuditEntry> => {
    const previousHash = await getLatestAuditHash();
    const entry: AuditEntry = {
      id: buildId('aud'),
      timestamp: new Date().toISOString(),
      ticketId: input.ticketId,
      actor: input.actor,
      role: input.role,
      action: input.action,
      event: input.event ?? null,
      details: input.details,
      previousHash,
    };
    entry.hash = computeAuditHash(entry);

    let tenantId = await ticketTenantId(input.ticketId);
    if (tenantId === GLOBAL_TENANT_ID) {
      const { data: actorRow } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('name', input.actor)
        .limit(1)
        .maybeSingle();
      tenantId = actorRow?.tenant_id || GLOBAL_TENANT_ID;
    }

    const { error } = await supabase.from('audit_logs').insert({
      id: entry.id,
      timestamp: entry.timestamp,
      ticket_id: entry.ticketId,
      tenant_id: tenantId,
      actor: entry.actor,
      role: entry.role,
      action: entry.action,
      event: entry.event,
      details: entry.details,
      hash: entry.hash,
      previous_hash: entry.previousHash || '',
      immutable: true,
    });
    if (error) throw new Error(`appendAuditLog failed: ${error.message}`);

    broadcast('audit_created', { id: entry.id, action: entry.action }, tenantId);
    return entry;
  };
  const result = auditQueue.then(run, run);
  // Keep the queue alive regardless of individual failures.
  auditQueue = result.catch(() => undefined);
  return result;
}

export async function listAuditLogs(limit = 500, user?: AuthUser): Promise<AuditEntry[]> {
  let query = supabase
    .from('audit_logs')
    .select('id, timestamp, ticket_id, actor, role, action, event, details, hash, previous_hash, tenant_id')
    .order('timestamp', { ascending: false })
    .limit(limit);
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    ticketId: r.ticket_id,
    actor: r.actor,
    role: r.role,
    action: r.action,
    event: r.event ?? undefined,
    details: r.details,
    hash: r.hash,
    previousHash: r.previous_hash,
  }));
}

/**
 * Fetch the full audit ledger oldest-first (chronological chain order) for
 * verification. Only global roles can verify the chain, so no tenant scoping
 * is applied here — a partial (tenant-scoped) slice can never validate a
 * globally-linked ledger. Sorted by timestamp then id for stable ordering.
 */
export async function listAuditLogsForVerification(): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, timestamp, ticket_id, actor, role, action, event, details, hash, previous_hash')
    .order('timestamp', { ascending: true })
    .order('id', { ascending: true })
    .limit(20000);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    ticketId: r.ticket_id,
    actor: r.actor,
    role: r.role,
    action: r.action,
    event: r.event ?? undefined,
    details: r.details,
    hash: r.hash,
    previousHash: r.previous_hash,
  }));
}

/**
 * Memory-bounded chain verification.
 *
 * Chain validation only ever needs the previous entry's hash, so the ledger
 * can be verified by streaming fixed-size pages oldest-first instead of
 * hydrating up to 20k rows (and their full detail strings) at once. Heap use
 * is O(pageSize) regardless of ledger length. Short-circuits at the first
 * break, reporting its global index.
 */
export async function verifyAuditChainPaged(
  pageSize = 1000
): Promise<{ valid: boolean; brokenIndex: number | null; checked: number }> {
  const cols = 'id, timestamp, ticket_id, actor, role, action, event, details, hash, previous_hash';
  let expectedPrevious = '';
  let offset = 0;
  let index = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select(cols)
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error || !data || data.length === 0) break;

    for (const r of data as any[]) {
      const prevHash = r.previous_hash || '';
      if (prevHash !== expectedPrevious) {
        return { valid: false, brokenIndex: index, checked: index };
      }
      const expectedHash = computeAuditHash({
        id: r.id,
        timestamp: r.timestamp,
        ticketId: r.ticket_id,
        actor: r.actor,
        role: r.role,
        action: r.action,
        details: r.details,
        previousHash: prevHash,
      });
      if (r.hash !== expectedHash) {
        return { valid: false, brokenIndex: index, checked: index };
      }
      expectedPrevious = r.hash;
      index++;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return { valid: true, brokenIndex: null, checked: index };
}

// ─── Notifications ─────────────────────────────────────────────────────

export async function listNotifications(recipient?: string, user?: AuthUser) {
  let query = supabase.from('watcher_notifications').select('*').order('timestamp', { ascending: false });
  if (recipient) {
    query = query.ilike('recipient', escapeLike(recipient));
  }
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    ticketId: r.ticket_id,
    message: r.message,
    recipient: r.recipient,
    seen: !!r.seen,
  }));
}

export async function insertNotification(n: {
  id: string;
  timestamp: string;
  ticketId: string;
  message: string;
  recipient: string;
  seen: boolean;
}) {
  const tenantId = await ticketTenantId(n.ticketId);
  const { error } = await supabase.from('watcher_notifications').insert({
    id: n.id,
    timestamp: n.timestamp,
    ticket_id: n.ticketId,
    tenant_id: tenantId,
    message: n.message,
    recipient: n.recipient,
    seen: n.seen,
  });
  if (error) throw new Error(`insertNotification failed: ${error.message}`);
  broadcast('notification_created', n, tenantId);
}

export async function markNotificationRead(id: string, user: AuthUser) {
  const tenantId = tenantScope(user);
  let query = supabase.from('watcher_notifications').update({ seen: true }).eq('id', id);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  query = query.eq('recipient', user.email);
  const { error } = await query;
  if (error) throw new Error(`markNotificationRead failed: ${error.message}`);
  // Broadcast so the same user's other open sessions clear the badge live.
  broadcast('notification_read', { id }, tenantId);
}

// ─── Evidence ──────────────────────────────────────────────────────────

export async function listEvidence(ticketIds?: string[], user?: AuthUser, limit?: number): Promise<Record<string, any>[]> {
  let query = supabase.from('evidence').select('*').order('uploaded_at', { ascending: false });
  if (ticketIds && ticketIds.length > 0) {
    query = query.in('ticket_id', ticketIds);
  }
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  // Bound the result set for bulk consumers (bootstrap).
  if (limit && limit > 0) query = query.limit(limit);
  const { data, error } = await query;
  if (error || !data) return [];
  const rows = data.map(toCamel);
  // Signed URLs expire; re-sign them so stored links stay downloadable.
  const refreshed = await refreshSignedUrls(rows.map(r => r.url as string | undefined));
  return rows.map((r, i) => ({ ...r, url: refreshed[i] || r.url }));
}

/** Fetch a single evidence row by id, scoped to the user's tenant. */
export async function getEvidenceById(id: string, user?: AuthUser): Promise<Record<string, any> | null> {
  let query = supabase.from('evidence').select('*').eq('id', id);
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  const row = toCamel(data);
  const [refreshed] = await refreshSignedUrls([row.url as string | undefined]);
  return { ...row, url: refreshed || row.url };
}

export async function insertEvidence(evidence: {
  id: string;
  ticketId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string;
  uploadedBy: string;
  url: string;
}) {
  const tenantId = await ticketTenantId(evidence.ticketId);
  const { error } = await supabase.from('evidence').insert({
    id: evidence.id,
    ticket_id: evidence.ticketId,
    tenant_id: tenantId,
    file_name: evidence.fileName,
    file_size: evidence.fileSize,
    file_type: evidence.fileType,
    uploaded_at: evidence.uploadedAt,
    uploaded_by: evidence.uploadedBy,
    url: evidence.url,
  });
  if (error) throw new Error(`insertEvidence failed: ${error.message}`);
  broadcast('evidence_added', { ...evidence, ticketId: evidence.ticketId }, tenantId);
}

export async function deleteEvidence(id: string) {
  const { error } = await supabase.from('evidence').delete().eq('id', id);
  if (error) throw new Error(`deleteEvidence failed: ${error.message}`);
  broadcast('evidence_removed', { id });
}

// ─── Major Incidents ───────────────────────────────────────────────────

export async function listMajorIncidents(user?: AuthUser) {
  let query = supabase.from('major_incidents')
    .select('*')
    .order('created_at', { ascending: false });
  if (user) {
const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isPartner(user)) {
    // Prefer partner_org_id FK (migration 044); fall back to partner name match
    if (user.partnerOrgId != null) {
      query = query.eq('partner_org_id', user.partnerOrgId);
    } else {
      query = query.ilike('partner', partnerNameFor(user));
    }
  }
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(toCamel);
}

/** Resolve a major incident's tenant from a ticket sharing its partner. */
async function majorIncidentTenantId(partner: string | undefined | null): Promise<string> {
  if (!partner) return GLOBAL_TENANT_ID;
  const { data } = await supabase
    .from('tickets')
    .select('tenant_id')
    .ilike('partner', partner)
    .limit(1)
    .maybeSingle();
  return data?.tenant_id || GLOBAL_TENANT_ID;
}

/** Load a single major incident enforcing the user's scope (tenant or partner). */
export async function getScopedMajorIncident(id: string, user: AuthUser): Promise<any | null> {
  let query = supabase.from('major_incidents').select('*').eq('id', id);
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isPartner(user)) {
    if (user.partnerOrgId != null) {
      query = query.eq('partner_org_id', user.partnerOrgId);
    } else {
      query = query.ilike('partner', partnerNameFor(user));
    }
  }
  const { data, error } = await query.single();
  if (error || !data) return null;
  return toCamel(data);
}

export async function upsertMajorIncident(mi: any) {
  const tenantId = mi.tenantId || (await majorIncidentTenantId(mi.partner));
  const row = toSnake({
    id: mi.id,
    tenantId,
    name: mi.name,
    description: mi.description || '',
    partner: mi.partner || '',
    category: mi.category || '',
    severity: mi.severity || 'MEDIUM',
    active: !!mi.active,
    ticketCount: mi.ticketCount || 0,
    createdAt: mi.createdAt,
    status: mi.status || 'INVESTIGATING',
    timeline: mi.timeline || [],
    notifications: mi.notifications || [],
    pir: mi.pir || null,
    declaredBy: mi.declaredBy || null,
    owner: mi.owner || null,
    affectedPartners: mi.affectedPartners || null,
    affectedBus: mi.affectedBus || null,
    impact: mi.impact || null,
    expectedRto: mi.expectedRto || null,
    severityJustification: mi.severityJustification || null,
    acknowledgedAt: mi.acknowledgedAt || null,
    resolvedAt: mi.resolvedAt || null,
    closedAt: mi.closedAt || null,
  });
  const { error } = await supabase.from('major_incidents').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertMajorIncident failed: ${error.message}`);
  broadcast('major_incident_updated', { id: mi.id }, tenantId);
}

/** Link an existing ticket to a major incident, upgrading to CRITICAL when severe. */
export async function linkTicketToMajorIncident(ticketId: string, miId: string, criticalUpgrade: boolean) {
  const row: Record<string, unknown> = { major_incident_id: miId };
  if (criticalUpgrade) row.priority = 'CRITICAL';
  const { error } = await supabase.from('tickets').update(row).eq('id', ticketId);
  if (error) throw new Error(`linkTicketToMajorIncident failed: ${error.message}`);
}

// ─── Customers ─────────────────────────────────────────────────────────

export async function listCustomers(user: AuthUser) {
  let query = supabase.from('customers').select('*');
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isPartner(user)) {
    query = query.eq('business_unit', user.bu);
  }
  const { data, error } = await query;
  if (error || !data) return [];

  // Derive totalTickets from the live ticket set (the stored counter drifts).
  // Aggregation runs in SQL via customer_ticket_counts() when available
  // (migration 043); the fallback fetches the single narrow customer_id column
  // and counts in-process. Legacy email-based matching is gone: customer_email
  // is encrypted per-row (migration 031), so plaintext equality never matched.
  const counts = new Map<string, number>();
  const rpc = (supabase as any).rpc;
  let aggregated = false;
  if (typeof rpc === 'function') {
    const { data: grouped, error: rpcError } = await (supabase as any).rpc('customer_ticket_counts', {
      p_tenant_id: tenantId ?? null,
      p_business_unit: isPartner(user) ? user.bu : null,
    });
    if (!rpcError && Array.isArray(grouped)) {
      aggregated = true;
      for (const row of grouped) {
        if (row?.customer_id) counts.set(String(row.customer_id), Number(row.total) || 0);
      }
    }
  }
  if (!aggregated) {
    let ticketQuery = supabase
      .from('tickets')
      .select('customer_id')
      .eq('is_deleted', false);
    if (tenantId) {
      ticketQuery = ticketQuery.eq('tenant_id', tenantId);
    } else if (isPartner(user)) {
      ticketQuery = ticketQuery.eq('business_unit', user.bu);
    }
    // Degraded mode (RPC unavailable): bound the scan so a huge ledger cannot
    // balloon heap. Counts above the cap degrade gracefully to undercounting.
    const { data: ticketRows } = await ticketQuery.limit(50_000);
    for (const t of ticketRows || []) {
      if (t.customer_id) counts.set(t.customer_id, (counts.get(t.customer_id) || 0) + 1);
    }
  }

  return data.map((row) => {
    const customer = toCamel(row);
    customer.totalTickets = counts.get(customer.id) || 0;
    return customer;
  });
}

export async function upsertCustomer(c: any) {
  const row = toSnake({
    id: c.id,
    firstName: c.firstName || c.first_name || '',
    lastName: c.lastName || c.last_name || '',
    email: c.email,
    phone: c.phone || '',
    businessUnit: c.businessUnit || c.business_unit || '',
    tenantId: c.tenantId || tenantIdForBu(c.businessUnit || c.business_unit || ''),
    createdAt: c.createdAt || c.created_at || new Date().toISOString(),
    totalTickets: c.totalTickets || c.total_tickets || 0,
    notes: c.notes || null,
  });
  const { error } = await supabase.from('customers').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertCustomer failed: ${error.message}`);
}

export async function deleteCustomer(id: string) {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw new Error(`deleteCustomer failed: ${error.message}`);
}

/** Load a single customer enforcing the user's scope (tenant or partner). */
export async function getScopedCustomer(id: string, user: AuthUser): Promise<any | null> {
  let query = supabase.from('customers').select('*').eq('id', id);
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isPartner(user)) {
    query = query.eq('business_unit', user.bu);
  }
  const { data, error } = await query.single();
  if (error || !data) return null;
  return toCamel(data);
}

/**
 * Find an existing customer by (email, business_unit) or create one. The
 * customers table has a UNIQUE(email, business_unit) constraint, so a single
 * email may exist once per business unit.
 */
export async function findOrCreateCustomer(opts: {
  email: string;
  businessUnit: string;
  name?: string;
  phone?: string;
}): Promise<{ id: string }> {
  const email = (opts.email || '').trim().toLowerCase();
  const businessUnit = (opts.businessUnit || '').trim();
  if (!email || !businessUnit) {
    throw new Error('A customer email and business unit are required');
  }

  const { data: existing, error: findError } = await supabase
    .from('customers')
    .select('id')
    .ilike('email', escapeLike(email))
    .ilike('business_unit', escapeLike(businessUnit))
    .maybeSingle();
  if (findError) throw new Error(`findOrCreateCustomer lookup failed: ${findError.message}`);
  if (existing) return { id: existing.id };

  let firstName = '';
  let lastName = '';
  const name = (opts.name || '').trim();
  if (name) {
    const parts = name.split(/\s+/);
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || '';
  }
  if (!firstName) firstName = email.split('@')[0] || 'Unknown';
  if (!lastName) lastName = '';

  const row = {
    id: buildId('cust'),
    first_name: firstName,
    last_name: lastName,
    email,
    phone: (opts.phone || '').trim(),
    business_unit: businessUnit,
    tenant_id: tenantIdForBu(businessUnit),
    total_tickets: 0,
  };
  const { error: insertError } = await supabase.from('customers').insert(row);
  if (insertError) {
    // Concurrent create on the same (email, business_unit): re-read the winner.
    const { data: winner, error: retryError } = await supabase
      .from('customers')
      .select('id')
      .ilike('email', escapeLike(email))
      .ilike('business_unit', escapeLike(businessUnit))
      .maybeSingle();
    if (!retryError && winner) return { id: winner.id };
    throw new Error(`findOrCreateCustomer insert failed: ${insertError.message}`);
  }
  return { id: row.id };
}

/** Count non-deleted tickets that reference a customer. customer_email is
 *  encrypted per-row (migration 031) so it can never be equality-matched;
 *  the id join key is the only reliable reference. */
export async function countTicketsByCustomer(opts: { id: string; email?: string; businessUnit?: string }): Promise<number> {
  let query = supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .eq('customer_id', opts.id);
  if (opts.businessUnit) {
    query = query.eq('business_unit', opts.businessUnit);
  }
  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

// ─── Generic Table Functions (SLA Rules, Holidays, Templates, KB) ─────

const tableMappers: Record<string, (row: any) => any> = {
  sla_rules: (r) => ({ id: r.id, category: r.category, priority: r.priority, durationHours: r.duration_hours }),
  holidays: (r) => ({ id: r.id, name: r.name, date: r.date, country: r.country }),
  ticket_templates: (r) => ({
    id: r.id, name: r.name, description: r.description, category: r.category,
    issueType: r.issue_type, priority: r.priority, partner: r.partner,
    amount: r.amount, ticketDescription: r.ticket_description,
  }),
  kb_articles: (r) => ({
    id: r.id, title: r.title, category: r.category, partner: r.partner,
    content: r.content, tags: r.tags, lastUpdated: r.last_updated,
  }),
};

const tableInsertMappers: Record<string, (item: any) => any> = {
  sla_rules: (i) => ({ id: i.id, category: i.category, priority: i.priority, duration_hours: i.durationHours || i.duration_hours || 24 }),
  holidays: (i) => ({ id: i.id, name: i.name, date: i.date, country: i.country || 'NG' }),
  ticket_templates: (i) => ({
    id: i.id, name: i.name, description: i.description || '', category: i.category,
    issue_type: i.issueType || i.issue_type, priority: i.priority || 'MEDIUM',
    partner: i.partner || 'General', amount: i.amount || '',
    ticket_description: i.ticketDescription || i.ticket_description || '',
  }),
  kb_articles: (i) => ({
    id: i.id, title: i.title, category: i.category, partner: i.partner || 'General',
    content: i.content || '', tags: i.tags || [], last_updated: i.lastUpdated || i.last_updated || '',
  }),
};

export async function listJsonTable(table: string) {
  const mapper = tableMappers[table];
  if (!mapper) return [];
  const { data, error } = await supabase.from(table as any).select('*');
  if (error || !data) return [];
  return data.map(mapper);
}

export async function replaceJsonTable(table: string, items: any[]) {
  const inserter = tableInsertMappers[table];
  if (!inserter) return;

  const rows = items.map(inserter);

  // Preferred path: the replace_table_rows RPC (migration 045) swaps the
  // whole table in one transaction — a mid-replace failure can never leave
  // the table empty. Falls back to delete+insert when the RPC is unavailable.
  const rpc = (supabase as any).rpc;
  if (typeof rpc === 'function') {
    const { error: rpcError } = await (supabase as any).rpc('replace_table_rows', {
      p_table: table,
      p_rows: rows,
    });
    if (!rpcError) return;
    // RPC missing/failed (e.g. migration not applied) — fall through to the
    // legacy non-atomic path so the operation still completes.
  }

  // Legacy non-atomic path (RPC unavailable): snapshot the current rows first
  // so a failed insert can be rolled back best-effort. Without this, a delete
  // followed by a failed insert would leave the table empty — e.g. wiping all
  // SLA rules and stripping every ticket of its deadline.
  const { data: backup, error: backupError } = await supabase.from(table as any).select('*');
  if (backupError) throw new Error(`replaceJsonTable snapshot failed (${table}): ${backupError.message}`);

  const { error: delError } = await supabase.from(table as any).delete().neq('id', '__none__');
  if (delError) throw new Error(`replaceJsonTable delete failed (${table}): ${delError.message}`);

  if (rows.length > 0) {
    const { error: insError } = await supabase.from(table as any).insert(rows);
    if (insError) {
      // Best-effort restore of the previous contents.
      if (backup && backup.length > 0) {
        await supabase.from(table as any).insert(backup);
      }
      throw new Error(`replaceJsonTable insert failed (${table}): ${insError.message}`);
    }
  }
}

// ─── Users ─────────────────────────────────────────────────────────────

export async function ensureTenantForBu(bu: string | undefined | null): Promise<string> {
  const tenantId = tenantIdForBu(bu);
  if (tenantId === GLOBAL_TENANT_ID) return tenantId;
  const name = String(bu ?? '').trim().toUpperCase() || tenantId;
  const { error } = await supabase
    .from('tenants')
    .upsert({ id: tenantId, name, business_units: [String(bu ?? '').trim()] }, { onConflict: 'id' });
  if (error) throw new Error(`ensureTenantForBu failed: ${error.message}`);
  return tenantId;
}

export async function listUsersPublic() {
  const { data, error } = await supabase.from('users').select('id, name, email, role, bu, partner, partner_org_id, account_type, phone, tenant_id, is_active, activation_token, must_change_password').order('name');
  if (error || !data) return [];
  return data.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    bu: u.bu || '',
    partner: u.partner || '',
    partnerOrgId: u.partner_org_id ?? null,
    accountType: u.account_type || (u.role === 'PARTNER' ? 'PARTNER' : 'BU'),
    phone: u.phone || '',
    tenantId: u.tenant_id || '',
    isActive: u.is_active !== false,
    // Derived flags so the admin UI can render Active / Pending / Suspended
    // without ever exposing the raw token or hash. An account is Pending while
    // it is inactive AND either still holds its activation token OR still needs
    // to choose its own password (legacy provisioned users predate tokens).
    activationPending: u.is_active === false && (Boolean(u.activation_token) || Boolean(u.must_change_password)),
    mustChangePassword: Boolean(u.must_change_password),
  }));
}

export async function upsertUser(user: {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  bu?: string;
  partner?: string;
  partnerOrgId?: number | null;
  accountType?: string;
  phone?: string;
  passwordHash?: string;
  authUserId?: string | null;
  tenantId?: string;
  mustChangePassword?: boolean;
  isActive?: boolean;
  activationToken?: string;
  activatedAt?: string;
  tokenVersion?: number;
}) {
  const row: any = { id: user.id };
  if (user.name !== undefined) row.name = user.name;
  if (user.email !== undefined) row.email = user.email;
  if (user.role !== undefined) row.role = user.role;
  if (user.bu !== undefined) row.bu = user.bu;
  if (user.partner !== undefined) row.partner = user.partner;
  if (user.partnerOrgId !== undefined) {
    row.partner_org_id = user.partnerOrgId;
  } else if (user.partner !== undefined && user.partner !== '') {
    // Keep the org FK in sync when the partner name is (re)assigned.
    row.partner_org_id = await resolvePartnerOrgId(user.partner);
  }
  if (user.accountType !== undefined) row.account_type = user.accountType;
  if (user.phone !== undefined) row.phone = user.phone;
  if (user.tenantId !== undefined) {
    row.tenant_id = user.tenantId;
  } else if (user.accountType === 'PARTNER') {
    row.tenant_id = GLOBAL_TENANT_ID;
  } else if (user.bu !== undefined) {
    row.tenant_id = await ensureTenantForBu(user.bu);
  }
  if (user.passwordHash) {
    row.password_hash = user.passwordHash;
  }
  if (user.authUserId !== undefined) {
    row.auth_user_id = user.authUserId;
  }
  if (user.mustChangePassword !== undefined) {
    row.must_change_password = user.mustChangePassword;
  }
  if (user.isActive !== undefined) {
    row.is_active = user.isActive;
  }
  if (user.activationToken !== undefined) {
    row.activation_token = user.activationToken;
  }
  if (user.activatedAt !== undefined) {
    row.activated_at = user.activatedAt;
  }
  if (user.tokenVersion !== undefined) {
    row.token_version = user.tokenVersion;
  }

  const isCompleteCreate = Boolean(user.name && user.email && user.role && user.passwordHash && (user.bu || user.partner));
  if (isCompleteCreate) {
    // Create or full update: insert path also carries auth_user_id. Only used
    // when every NOT NULL column is present; partial updates of existing users
    // (e.g. change/reset password) must not go through upsert, which would
    // reset omitted columns and violate NOT NULL constraints.
    const { error } = await supabase.from('users').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`upsertUser failed: ${error.message}`);
  } else {
    // Partial update: PostgREST .update() touches only the provided columns.
    const { id: _id, ...patch } = row;
    const { error } = await supabase.from('users').update(patch).eq('id', user.id);
    if (error) throw new Error(`upsertUser failed: ${error.message}`);
  }
}

export async function deleteUser(id: string) {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
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

// ─── App Config ────────────────────────────────────────────────────────

// Read-through cache for app_config values. Config rows are admin-managed and
// change rarely, but getConfig is hit on virtually every request (roles, BUs,
// SLA rules…). A short TTL removes the redundant DB round-trips under load.
// Writes through setConfig invalidate immediately. The cache also self-flushes
// when the Supabase client identity changes (tests swap in a fresh fake per
// test), preventing stale cross-test contamination.
const CONFIG_CACHE_TTL_MS = 60_000;
const configCache = new Map<string, { value: unknown; expiresAt: number; clientRef: unknown }>();

function flushConfigCacheIfStale(): void {
  const first = configCache.entries().next();
  if (!first.done && first.value[1].clientRef !== supabase) configCache.clear();
}

export function clearConfigCache(): void {
  configCache.clear();
}

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  flushConfigCacheIfStale();
  const cached = configCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', key)
    .single();
  if (error || !data) return fallback;
  configCache.set(key, { value: data.value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS, clientRef: supabase });
  return data.value as T;
}

export async function setConfig(key: string, value: any) {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(`setConfig failed (${key}): ${error.message}`);
  configCache.delete(key);
}

// ─── Reference data: referential-integrity counters ───────────────────
// All counters use head-count queries: the database counts, no rows ship.

export async function countTicketsByBu(bu: string): Promise<number> {
  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('business_unit', bu)
    .eq('is_deleted', false);
  if (error) return 0;
  return count || 0;
}

export async function countTicketsByPartner(partner: string): Promise<number> {
  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('partner', partner)
    .eq('is_deleted', false);
  if (error) return 0;
  return count || 0;
}

export async function countTicketsByCategory(category: string): Promise<number> {
  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('category', category)
    .eq('is_deleted', false);
  if (error) return 0;
  return count || 0;
}

export async function countUsersByBu(bu: string): Promise<number> {
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('bu', bu);
  if (error) return 0;
  return count || 0;
}

export async function countActiveTicketsByCategoryAndPriority(category: string, priority: string): Promise<number> {
  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .ilike('category', escapeLike(category.trim()))
    .ilike('priority', escapeLike(priority.trim()))
    .eq('is_deleted', false);
  if (error) return 0;
  return count || 0;
}

export async function categoryExists(name: string): Promise<boolean> {
  const items = await listConfigItems('categories', []);
  return items.some((c: any) => {
    const catName = typeof c === 'string' ? c : c?.name;
    return String(catName ?? '').trim().toLowerCase() === name.trim().toLowerCase();
  });
}

// ─── Reference data: app_config list manipulation ─────────────────────

/**
 * Returns the identity of an app_config list item. String items are
 * identified by their value; object items by their `id` (or `name` fallback).
 */
function configItemId(item: any): string {
  if (item == null) return '';
  if (typeof item === 'string') return String(item);
  return String(item.id ?? item.name ?? '');
}

export async function listConfigItems(key: string, fallback: any[]): Promise<any[]> {
  try {
    return (await getConfig<any[]>(key, fallback)) ?? [];
  } catch {
    return [];
  }
}

export async function addConfigItem(key: string, item: any): Promise<any[]> {
  const items = await listConfigItems(key, []);
  const id = configItemId(item);
  if (!id) throw new Error('Item needs an id or value');
  if (items.some((x) => configItemId(x) === id)) {
    throw new Error(`"${id}" already exists`);
  }
  const next = [...items, item];
  await setConfig(key, next);
  return next;
}

export async function updateConfigItem(key: string, id: string, patch: any): Promise<any[]> {
  const items = await listConfigItems(key, []);
  const target = items.find((x) => configItemId(x) === id);
  if (!target) throw new Error(`Not found: ${id}`);
  const next = items.map((x) => {
    if (configItemId(x) !== id) return x;
    if (typeof x === 'string') {
      // Legacy string row upgraded to an object patch (e.g. BU now carries a code).
      if (typeof patch === 'object' && patch !== null) return { ...patch, name: patch.name ?? String(x), id: x };
      return String(patch);
    }
    const merged = { ...x, ...patch };
    if (x.id || patch?.id) merged.id = x.id || patch.id;
    else if (!merged.name) merged.id = id;
    return merged;
  });
  await setConfig(key, next);
  return next;
}

export async function removeConfigItem(key: string, id: string): Promise<any[]> {
  const items = await listConfigItems(key, []);
  const next = items.filter((x) => configItemId(x) !== id);
  await setConfig(key, next);
  return next;
}

// ─── Reference data: custom kinds (user-created) ─────────────────────

export interface CustomReferenceKind {
  kind: string;
  label: string;
  labelPlural: string;
  description: string;
  stringItems: true;
}

export async function listCustomReferenceKinds(): Promise<CustomReferenceKind[]> {
  return (await getConfig<CustomReferenceKind[]>('customReferenceKinds', [])) ?? [];
}

export async function addCustomReferenceKind(def: CustomReferenceKind): Promise<void> {
  const kinds = await listCustomReferenceKinds();
  if (kinds.some((k) => String(k.kind ?? '').trim().toLowerCase() === String(def.kind).trim().toLowerCase())) {
    throw new Error(`A reference kind "${def.kind}" already exists`);
  }
  await setConfig('customReferenceKinds', [...kinds, def]);
}

// ─── Reference data: JSON-table (row) manipulation ────────────────────

export async function insertJsonTableRow(table: string, item: any) {
  const inserter = tableInsertMappers[table];
  if (!inserter) throw new Error(`Unknown table: ${table}`);
  const row = inserter(item);
  if (!row.id) throw new Error('Row requires an id');
  const { error } = await supabase.from(table as any).insert(row);
  if (error) throw new Error(`insertJsonTableRow failed (${table}): ${error.message}`);
}

export async function updateJsonTableRow(table: string, id: string, patch: any) {
  const mapper = tableMappers[table];
  const inserter = tableInsertMappers[table];
  if (!mapper || !inserter) throw new Error(`Unknown table: ${table}`);
  // Fetch current clean row, merge patch, reconstruct through the inserter
  // to keep snake_case->camelCase consistency.
  const { data: existing } = await supabase.from(table as any).select('*').eq('id', id).single();
  if (!existing) throw new Error(`Not found: ${id}`);
  const current = mapper(existing);
  const merged = { ...current, ...patch, id };
  const row = inserter(merged);
  const { error } = await supabase.from(table as any).update(row).eq('id', id);
  if (error) throw new Error(`updateJsonTableRow failed (${table}): ${error.message}`);
}

export async function deleteJsonTableRow(table: string, id: string) {
  const { error } = await supabase.from(table as any).delete().eq('id', id);
  if (error) throw new Error(`deleteJsonTableRow failed (${table}): ${error.message}`);
}

// ─── Business Hours ─────────────────────────────────────────────────────

export async function listBusinessHours(tenantId?: string): Promise<any[]> {
  let query = supabase.from('business_hours').select('*');
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query.order('tenant_id').order('day_of_week');
  if (error) throw new Error(`listBusinessHours failed: ${error.message}`);
  return data ?? [];
}

export async function upsertBusinessHours(rows: any[]): Promise<void> {
  if (!rows.length) return;
  // Single bulk upsert — one round-trip instead of N sequential writes.
  const { error } = await supabase.from('business_hours').upsert(rows, { onConflict: 'tenant_id,day_of_week' });
  if (error) throw new Error(`upsertBusinessHours failed: ${error.message}`);
}

// Re-export webhook helpers from the dispatcher so callers can import them through
// the conventional `repository` entry-point without needing to know the service layer.
export { dispatchWebhook, registerDeliveryAttempt } from './services/webhookDispatcher';
