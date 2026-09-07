import { supabase } from '../supabase';
import { type AuthUser } from '../compliance';
import { tenantIdForBu } from '../tenant';
import { buildId } from '../lib/ids';
import { escapeLike } from '../lib/escapeLike';
import { tenantScope, isPartner, toCamel, toSnake } from './shared';

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
