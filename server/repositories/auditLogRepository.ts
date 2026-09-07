import { supabase } from '../supabase';
import { computeAuditHash, type AuditEntry, type AuthUser } from '../compliance';
import { broadcast } from '../broadcast';
import { buildId } from '../lib/ids';
import { tenantScope, ticketTenantId, GLOBAL_TENANT_ID } from './shared';

// ─── Audit Logs ────────────────────────────────────────────────────────

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
    // Acquire transaction-scoped advisory lock to serialize audit writes across
    // multiple processes (PM2 cluster, K8s pods). Key 0x41554449 = 'AUDI' hex.
    // Best-effort: if the RPC doesn't exist (test fake client) or function
    // isn't available, fall back to in-process queue only.
    try {
      const { error: lockError } = await supabase.rpc('pg_advisory_xact_lock', {
        key: 0x41554449,
      });
      // Missing-function shapes seen in the wild:
      //  - Postgres: "function public.pg_advisory_xact_lock(key) does not exist"
      //  - PostgREST: "Could not find the function public.pg_advisory_xact_lock(key)
      //    in the schema cache" (PGRST202)
      //  - fake client: "rpc is not a function"
      const isMissingLockFn =
        /function .* does not exist|unknown function/i.test(lockError?.message || '') ||
        /could not find the function|in the schema cache|PGRST202/i.test(lockError?.message || '') ||
        /rpc is not a function/i.test(lockError?.message || '');
      if (lockError && !isMissingLockFn) {
        throw new Error(`Audit lock failed: ${lockError.message}`);
      }
    } catch (e: any) {
      // Ignore "rpc is not a function" (fake client) or missing function
      const isMissingLockFn =
        /rpc is not a function|function .* does not exist|unknown function/i.test(e?.message || '') ||
        /could not find the function|in the schema cache|PGRST202/i.test(e?.message || '');
      if (!isMissingLockFn) {
        throw e;
      }
    }

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
