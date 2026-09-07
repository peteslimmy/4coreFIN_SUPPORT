/**
 * Shared helpers for the Next.js security regression suite.
 *
 * These tests invoke the real route handlers in src/app/api/** directly with
 * constructed NextRequests — no HTTP server, no legacy Express router — so the
 * migrated code paths (session, CSRF, RBAC guards, field allowlists,
 * optimistic concurrency) are exercised exactly as shipped.
 */

import { NextRequest } from 'next/server';
import { signToken, SESSION_COOKIE, CSRF_COOKIE } from '../../../server/auth';
import { createFakeSupabase, type TableStore } from '../../../tests/helpers/fakeSupabase';
import { encrypt } from '../../../server/services/encryptionService';
import { supabase } from '../../../server/supabase';
import { supabaseAdmin } from '../../../server/supabaseAdmin';

export const TENANT = 'tnt-BU-A';
export const CSRF = 'csrf-regression-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function makeAuthUser(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    id: 'usr-agent',
    sub: 'usr-agent',
    name: 'Agent One',
    email: 'agent@4core.com',
    role: 'BU_SUPPORT_L1',
    bu: 'BU-A',
    phone: '',
    tenantId: TENANT,
    tokenVersion: 0,
    ...overrides,
  };
}

export function makeUserRow(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    id: 'usr-agent',
    name: 'Agent One',
    email: 'agent@4core.com',
    password_hash: 'x',
    role: 'BU_SUPPORT_L1',
    bu: 'BU-A',
    phone: '',
    tenant_id: TENANT,
    partner: null,
    partner_org_id: null,
    account_type: null,
    is_active: true,
    must_change_password: false,
    activation_token: null,
    token_version: null,
    ...overrides,
  };
}

export function seedTicket(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    id: 'tkt-1',
    customer_name: 'Acme Corp',
    // PII is encrypted at rest (migration 031); read paths decrypt via tryDecrypt.
    customer_email: encrypt('cust@acme.com'),
    customer_phone: encrypt('555-0100'),
    customer_last_name: '',
    customer_id: null,
    business_unit: 'BU-A',
    tenant_id: TENANT,
    partner: '',
    partner_org_id: null,
    category: 'Payment',
    issue_type: 'Payment',
    status: 'ASSIGNED',
    priority: 'HIGH',
    amount: 100,
    transaction_id: 'TX-1',
    card_pan: '',
    bank_name: '',
    description: 'test ticket',
    created_at: new Date().toISOString(),
    sla_deadline: null,
    sla_paused_ms: 0,
    sla_pause_started_at: null,
    is_escalated: false,
    escalation_count: 0,
    assigned_agent_id: '',
    major_incident_id: null,
    feedback_score: null,
    feedback_comment: null,
    root_cause: null,
    corrective_action: null,
    submitted_by: 'BU_SUPPORT',
    submitted_by_name: 'Officer',
    submitted_by_phone: '',
    is_deleted: false,
    watchers: [],
    rca_details: null,
    custom_fields: {},
    duplicate_of: null,
    version: 3,
    ...overrides,
  };
}

export function seedStore(): TableStore {
  return {
    users: [makeUserRow()],
    tickets: [seedTicket()],
    comments: [],
    evidence: [],
    audit_logs: [],
    watcher_notifications: [],
    major_incidents: [],
    sla_rules: [],
    holidays: [],
    ticket_templates: [],
    customers: [],
    kb_articles: [],
    organizations: [],
    tenants: [],
    app_config: [{ key: 'roles', value: [] }],
  };
}

/**
 * Point both the service client and the admin client at ONE fake instance
 * backed by the same internal store (repositories read via `supabase`,
 * admin-only routes via `supabaseAdmin` — shared data, one source of truth).
 *
 * Returns the fake's LIVE internal store: the seed is cloned at install time,
 * so all per-test mutations and assertions must go through the returned store.
 */
export function installFakeSupabase(seed: TableStore): TableStore {
  const fake = createFakeSupabase(seed);
  Object.assign(supabase as unknown as Record<string, unknown>, fake);
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, fake);
  return fake.store;
}

/** Build an authenticated NextRequest (session cookie + CSRF double-submit). */
export function authedRequest(
  pathAndQuery: string,
  user: Record<string, any>,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): NextRequest {
  const method = opts.method || 'GET';
  const token = signToken(makeAuthUser(user) as never);
  const headers: Record<string, string> = {
    Cookie: `${SESSION_COOKIE}=${token}; ${CSRF_COOKIE}=${CSRF}`,
  };
  if (!SAFE_METHODS.has(method)) {
    headers['x-csrf-token'] = CSRF;
  }
  // Caller headers win (e.g. a deliberately wrong CSRF token, cross-origin).
  Object.assign(headers, opts.headers || {});
  const init: Record<string, unknown> = { method, headers };
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  return new NextRequest(`http://localhost:3000${pathAndQuery}`, init as RequestInit);
}

export function unauthenticatedRequest(pathAndQuery: string, opts: { method?: string } = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${pathAndQuery}`, { method: opts.method || 'GET' });
}

/**
 * Simulate a concurrent writer that bumps every ticket row's version the
 * moment an UPDATE lands — between the handler's read and its CAS write —
 * so the repository's optimistic-concurrency branch returns zero matched
 * rows and the handler must answer 409 CONCURRENT_MODIFICATION.
 * Returns a restore function.
 */
export function interceptTicketUpdatesWithVersionBump(store: TableStore): () => void {
  const realFrom = (supabase as unknown as { from: (t: string) => any }).from.bind(supabase);
  (supabase as unknown as { from: unknown }).from = (table: string) => {
    const qb = realFrom(table);
    if (table === 'tickets') {
      const origUpdate = qb.update.bind(qb);
      qb.update = (row: Record<string, unknown>) => {
        for (const r of store.tickets || []) {
          r.version = (r.version || 1) + 1;
        }
        return origUpdate(row);
      };
    }
    return qb;
  };
  return () => {
    (supabase as unknown as { from: unknown }).from = realFrom;
  };
}
