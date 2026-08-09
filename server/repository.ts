import { supabase } from './supabase';
import { computeAuditHash, type AuditEntry, type AuthUser, applyTicketMasking } from './compliance';
import { canAccessTicket } from './auth';
import { tenantIdForBu, GLOBAL_TENANT_ID } from './tenant';
import { broadcast } from './broadcast';

// ─── Tenant scoping helpers ────────────────────────────────────────────

/**
 * Return the tenant id that a user is restricted to, or null when the user
 * may read across all tenants (SUPER_ADMIN / EXECUTIVE / bu === 'ALL').
 * PROVIDER is scoped by provider name, not tenant (handled separately).
 */
export function tenantScope(user: AuthUser): string | null {
  if (user.role === 'SUPER_ADMIN' || user.role === 'EXECUTIVE') return null;
  if (user.bu === 'ALL') return null;
  return user.tenantId || '';
}

function isProvider(user: AuthUser): boolean {
  return user.role === 'PROVIDER';
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

export async function listTickets(user: AuthUser, opts?: { includeDeleted?: boolean; unmask?: boolean }) {
  let query = supabase.from('tickets').select('*').order('created_at', { ascending: false });
  if (!opts?.includeDeleted) {
    query = query.eq('is_deleted', false);
  }
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isProvider(user)) {
    query = query.ilike('provider', user.bu);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data
    .map(toCamel)
    .filter((t) => canAccessTicket(user, t))
    .map((t) => applyTicketMasking(t, user, !!opts?.unmask));
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
  } else if (isProvider(user)) {
    query = query.ilike('provider', user.bu);
  }
  const { data, error } = await query.single();
  if (error || !data) return null;
  const ticket = toCamel(data);
  if (!canAccessTicket(user, ticket)) return null;
  return ticket;
}

export async function getTicket(id: string, user: AuthUser, unmask = false): Promise<any | null> {
  const ticket = await getScopedTicket(id, user);
  if (!ticket) return null;
  return applyTicketMasking(ticket, user, unmask);
}

export async function upsertTicket(ticket: any) {
  const row = toSnake({
    id: ticket.id,
    customerName: ticket.customerName || '',
    customerEmail: ticket.customerEmail || '',
    customerPhone: ticket.customerPhone || '',
    customerLastName: ticket.customerLastName || '',
    customerId: ticket.customerId || null,
    businessUnit: ticket.businessUnit,
    tenantId: ticket.tenantId || tenantIdForBu(ticket.businessUnit),
    provider: ticket.provider,
    category: ticket.category,
    issueType: ticket.category || '',
    priority: ticket.priority,
    status: ticket.status,
    amount: ticket.amount || 0,
    transactionId: ticket.transactionId || '',
    cardPan: ticket.cardPan || '',
    bankName: ticket.bankName || '',
    description: ticket.description || '',
    createdAt: ticket.createdAt,
    slaDeadline: ticket.slaDeadline,
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
    submittedByPhone: ticket.submittedByPhone || '',
    isDeleted: !!ticket.isDeleted,
    watchers: ticket.watchers || [],
    rcaDetails: ticket.rcaDetails || null,
    customFields: ticket.customFields || {},
    duplicateOf: ticket.duplicateOf || null,
  });

  const { error } = await supabase.from('tickets').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertTicket failed: ${error.message}`);
  broadcast('ticket_updated', { id: ticket.id }, row.tenant_id);
}

// ─── Comments ──────────────────────────────────────────────────────────

/** Normalize a comment row's seenBy to always be an array (JSONB may hold a
 * string literal like "[]" from older seeds). */
function normalizeComment(comment: Record<string, any>): Record<string, any> {
  const seenBy = comment.seenBy;
  return { ...comment, seenBy: Array.isArray(seenBy) ? seenBy : [] };
}

export async function listComments(ticketIds?: string[], user?: AuthUser) {
  let query = supabase.from('comments').select('*').order('timestamp', { ascending: false });
  if (ticketIds && ticketIds.length > 0) {
    query = query.in('ticket_id', ticketIds);
  }
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
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

export async function appendAuditLog(input: {
  ticketId: string | null;
  actor: string;
  role: string;
  action: string;
  details: string;
}): Promise<AuditEntry> {
  const previousHash = await getLatestAuditHash();
  const entry: AuditEntry = {
    id: 'aud-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    ticketId: input.ticketId,
    actor: input.actor,
    role: input.role,
    action: input.action,
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
    details: entry.details,
    hash: entry.hash,
    previous_hash: entry.previousHash || '',
    immutable: true,
  });
  if (error) throw new Error(`appendAuditLog failed: ${error.message}`);

  broadcast('audit_created', { id: entry.id, action: entry.action }, tenantId);
  return entry;
}

export async function listAuditLogs(limit = 500, user?: AuthUser): Promise<AuditEntry[]> {
  let query = supabase
    .from('audit_logs')
    .select('id, timestamp, ticket_id, actor, role, action, details, hash, previous_hash')
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
    .select('id, timestamp, ticket_id, actor, role, action, details, hash, previous_hash')
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
    details: r.details,
    hash: r.hash,
    previousHash: r.previous_hash,
  }));
}

// ─── Notifications ─────────────────────────────────────────────────────

export async function listNotifications(recipient?: string, user?: AuthUser) {
  let query = supabase.from('watcher_notifications').select('*').order('timestamp', { ascending: false });
  if (recipient) {
    query = query.ilike('recipient', recipient);
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

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from('watcher_notifications').update({ seen: true }).eq('id', id);
  if (error) throw new Error(`markNotificationRead failed: ${error.message}`);
}

// ─── Evidence ──────────────────────────────────────────────────────────

export async function listEvidence(ticketIds?: string[], user?: AuthUser): Promise<Record<string, any>[]> {
  let query = supabase.from('evidence').select('*').order('uploaded_at', { ascending: false });
  if (ticketIds && ticketIds.length > 0) {
    query = query.in('ticket_id', ticketIds);
  }
  const tenantId = user ? tenantScope(user) : null;
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(toCamel);
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
    } else if (isProvider(user)) {
      query = query.ilike('provider', user.bu);
    }
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(toCamel);
}

/** Resolve a major incident's tenant from a ticket sharing its provider. */
async function majorIncidentTenantId(provider: string | undefined | null): Promise<string> {
  if (!provider) return GLOBAL_TENANT_ID;
  const { data } = await supabase
    .from('tickets')
    .select('tenant_id')
    .ilike('provider', provider)
    .limit(1)
    .maybeSingle();
  return data?.tenant_id || GLOBAL_TENANT_ID;
}

/** Load a single major incident enforcing the user's scope (tenant or provider). */
export async function getScopedMajorIncident(id: string, user: AuthUser): Promise<any | null> {
  let query = supabase.from('major_incidents').select('*').eq('id', id);
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isProvider(user)) {
    query = query.ilike('provider', user.bu);
  }
  const { data, error } = await query.single();
  if (error || !data) return null;
  return toCamel(data);
}

export async function upsertMajorIncident(mi: any) {
  const tenantId = mi.tenantId || (await majorIncidentTenantId(mi.provider));
  const row = toSnake({
    id: mi.id,
    tenantId,
    name: mi.name,
    description: mi.description || '',
    provider: mi.provider || '',
    category: mi.category || '',
    severity: mi.severity || 'MEDIUM',
    active: !!mi.active,
    ticketCount: mi.ticketCount || 0,
    createdAt: mi.createdAt,
    status: mi.status || 'INVESTIGATING',
    timeline: mi.timeline || [],
    notifications: mi.notifications || [],
    pir: mi.pir || null,
  });
  const { error } = await supabase.from('major_incidents').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertMajorIncident failed: ${error.message}`);
  broadcast('major_incident_updated', { id: mi.id }, tenantId);
}

// ─── Customers ─────────────────────────────────────────────────────────

export async function listCustomers(user: AuthUser) {
  let query = supabase.from('customers').select('*');
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isProvider(user)) {
    query = query.eq('business_unit', user.bu);
  }
  const { data, error } = await query;
  if (error || !data) return [];

  // Derive totalTickets from the live ticket set (the stored counter drifts).
  let ticketQuery = supabase
    .from('tickets')
    .select('customer_id, customer_email, business_unit')
    .eq('is_deleted', false);
  if (tenantId) {
    ticketQuery = ticketQuery.eq('tenant_id', tenantId);
  } else if (isProvider(user)) {
    ticketQuery = ticketQuery.eq('business_unit', user.bu);
  }
  const { data: tickets } = await ticketQuery;
  const byCustomerId = new Map<string, number>();
  const byEmailBu = new Map<string, number>();
  for (const t of tickets || []) {
    if (t.customer_id) {
      byCustomerId.set(t.customer_id, (byCustomerId.get(t.customer_id) || 0) + 1);
    } else if (t.customer_email) {
      const key = `${(t.customer_email || '').toLowerCase()}|${(t.business_unit || '').toUpperCase()}`;
      byEmailBu.set(key, (byEmailBu.get(key) || 0) + 1);
    }
  }

  return data.map((row) => {
    const customer = toCamel(row);
    const linked = byCustomerId.get(customer.id) || 0;
    const fallback = byEmailBu.get(`${(customer.email || '').toLowerCase()}|${(customer.businessUnit || '').toUpperCase()}`) || 0;
    customer.totalTickets = linked + fallback;
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

/** Load a single customer enforcing the user's scope (tenant or provider). */
export async function getScopedCustomer(id: string, user: AuthUser): Promise<any | null> {
  let query = supabase.from('customers').select('*').eq('id', id);
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isProvider(user)) {
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
    .ilike('email', email)
    .ilike('business_unit', businessUnit)
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
    id: 'cust-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
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
      .ilike('email', email)
      .ilike('business_unit', businessUnit)
      .maybeSingle();
    if (!retryError && winner) return { id: winner.id };
    throw new Error(`findOrCreateCustomer insert failed: ${insertError.message}`);
  }
  return { id: row.id };
}

/** Count non-deleted tickets that reference a customer (by id, or email fallback). */
export async function countTicketsByCustomer(opts: { id: string; email?: string; businessUnit?: string }): Promise<number> {
  let query = supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false);
  if (opts.email) {
    // PostgREST OR: customer_id = id OR customer_email = email (within BU when known)
    const orClause = `customer_id.eq.${opts.id},customer_email.eq.${opts.email.replace(/'/g, "''")}`;
    query = query.or(orClause);
  } else {
    query = query.eq('customer_id', opts.id);
  }
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
    issueType: r.issue_type, priority: r.priority, provider: r.provider,
    amount: r.amount, ticketDescription: r.ticket_description,
  }),
  kb_articles: (r) => ({
    id: r.id, title: r.title, category: r.category, provider: r.provider,
    content: r.content, tags: r.tags, lastUpdated: r.last_updated,
  }),
};

const tableInsertMappers: Record<string, (item: any) => any> = {
  sla_rules: (i) => ({ id: i.id, category: i.category, priority: i.priority, duration_hours: i.durationHours || i.duration_hours || 24 }),
  holidays: (i) => ({ id: i.id, name: i.name, date: i.date, country: i.country || 'NG' }),
  ticket_templates: (i) => ({
    id: i.id, name: i.name, description: i.description || '', category: i.category,
    issue_type: i.issueType || i.issue_type, priority: i.priority || 'MEDIUM',
    provider: i.provider || 'General', amount: i.amount || '',
    ticket_description: i.ticketDescription || i.ticket_description || '',
  }),
  kb_articles: (i) => ({
    id: i.id, title: i.title, category: i.category, provider: i.provider || 'General',
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

  // Delete all existing rows
  const { error: delError } = await supabase.from(table as any).delete().neq('id', '__none__');
  if (delError) throw new Error(`replaceJsonTable delete failed (${table}): ${delError.message}`);

  // Insert new rows in batches
  if (items.length > 0) {
    const rows = items.map(inserter);
    const { error: insError } = await supabase.from(table as any).insert(rows);
    if (insError) throw new Error(`replaceJsonTable insert failed (${table}): ${insError.message}`);
  }
}

// ─── Users ─────────────────────────────────────────────────────────────

export async function listUsersPublic() {
  const { data, error } = await supabase.from('users').select('id, name, email, role, bu, phone, tenant_id').order('name');
  if (error || !data) return [];
  return data.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    bu: u.bu,
    phone: u.phone || '',
    tenantId: u.tenant_id || '',
  }));
}

export async function upsertUser(user: {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  bu?: string;
  phone?: string;
  passwordHash?: string;
  authUserId?: string | null;
  tenantId?: string;
  mustChangePassword?: boolean;
}) {
  const row: any = { id: user.id };
  if (user.name !== undefined) row.name = user.name;
  if (user.email !== undefined) row.email = user.email;
  if (user.role !== undefined) row.role = user.role;
  if (user.bu !== undefined) row.bu = user.bu;
  if (user.phone !== undefined) row.phone = user.phone;
  if (user.tenantId !== undefined) {
    row.tenant_id = user.tenantId;
  } else if (user.bu !== undefined) {
    row.tenant_id = tenantIdForBu(user.bu);
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

  const isCompleteCreate = Boolean(user.name && user.email && user.role && user.bu && user.passwordHash);
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
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('is_deleted', false)
    .not('status', 'in', '(CLOSED,RESOLVED)');
  if (error || !data) return [];
  return data.map(toCamel);
}

// ─── App Config ────────────────────────────────────────────────────────

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', key)
    .single();
  if (error || !data) return fallback;
  return data.value as T;
}

export async function setConfig(key: string, value: any) {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(`setConfig failed (${key}): ${error.message}`);
}

// ─── Reference data: referential-integrity counters ───────────────────

export async function countTicketsByBu(bu: string): Promise<number> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id')
    .eq('business_unit', bu)
    .eq('is_deleted', false);
  if (error || !data) return 0;
  return data.length;
}

export async function countTicketsByProvider(provider: string): Promise<number> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id')
    .eq('provider', provider)
    .eq('is_deleted', false);
  if (error || !data) return 0;
  return data.length;
}

export async function countTicketsByCategory(category: string): Promise<number> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id')
    .eq('category', category)
    .eq('is_deleted', false);
  if (error || !data) return 0;
  return data.length;
}

export async function countUsersByBu(bu: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('bu', bu);
  if (error || !data) return 0;
  return data.length;
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
