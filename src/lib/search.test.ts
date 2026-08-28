import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { vi } from 'vitest';

vi.mock('../../server/supabase', () => {
  const s = { from: () => { throw new Error('not initialised'); } };
  return { supabase: s, supabaseAuth: s };
});

import express from 'express';
import { supabase } from '../../server/supabase';
import { createApiRouter } from '../../server/routes';
import { requireCsrf, hashPassword, type AuthedRequest } from '../../server/auth';
import { createFakeSupabase, type TableStore } from '@/tests/helpers/fakeSupabase';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

function seedStore(): TableStore {
  const pass = hashPassword(PASSWORD);
  return {
    users: [
      { id: 'usr-admin', name: 'Admin', email: 'admin@4core.com', password_hash: pass, role: 'SUPER_ADMIN', bu: 'ALL', phone: '', tenant_id: ALPHA },
    ],
    tickets: [
      { id: 'tkt-1', customer_name: 'Acme Corp', category: 'Payment Issue', status: 'open', priority: 'high', tenant_id: ALPHA },
      { id: 'tkt-2', customer_name: 'Beta Ltd', category: 'Login Problem', status: 'resolved', priority: 'low', tenant_id: ALPHA },
    ],
    comments: [], evidence: [], audit_logs: [], watcher_notifications: [],
    major_incidents: [], app_config: [], sla_rules: [], holidays: [],
    ticket_templates: [],
    customers: [
      { id: 'cust-1', first_name: 'Alice', last_name: 'Johnson', email: 'alice@acme.com', business_unit: 'Finance', tenant_id: ALPHA },
      { id: 'cust-2', first_name: 'Bob', last_name: 'Smith', email: 'bob@beta.com', business_unit: 'Operations', tenant_id: ALPHA },
    ],
    kb_articles: [
      { id: 'kb-1', title: 'Payment Processing Guide', category: 'Finance', provider: 'Internal', tenant_id: ALPHA },
      { id: 'kb-2', title: 'Password Reset Instructions', category: 'Support', provider: 'Internal', tenant_id: ALPHA },
    ],
    'documents.document_folders': [],
    'documents.document_registry': [
      { id: 'doc-1', title: 'Payment Terms Agreement', file_name: 'payment-terms.pdf', file_type: 'pdf', status: 'active', tenant_id: ALPHA },
      { id: 'doc-2', title: 'Service Level Policy', file_name: 'slp.docx', file_type: 'docx', status: 'active', tenant_id: ALPHA },
    ],
    'documents.document_versions': [],
    'documents.document_permissions': [],
    'analytics.sla_daily_snapshot': [],
    'analytics.ticket_daily_snapshot': [],
    'analytics.partner_daily_snapshot': [],
    'search.search_log': [
      { id: 'sl-1', user_id: 'usr-admin', query: 'payment', created_at: '2026-08-21T10:00:00Z' },
      { id: 'sl-2', user_id: 'usr-admin', query: 'payment', created_at: '2026-08-21T10:05:00Z' },
      { id: 'sl-3', user_id: 'usr-admin', query: 'login', created_at: '2026-08-21T09:00:00Z' },
      { id: 'sl-4', user_id: 'usr-admin', query: 'payment', created_at: '2026-08-20T14:00:00Z' },
      { id: 'sl-5', user_id: 'usr-admin', query: 'password', created_at: '2026-08-20T13:00:00Z' },
    ],
    'search.search_shortcuts': [
      { id: 'ss-1', keyword: 'payments', target_url: '/analytics/sla', description: 'View SLA analytics', icon: 'chart', active: true, tenant_id: ALPHA },
      { id: 'ss-2', keyword: 'users', target_url: '/users', description: 'Manage users', icon: 'users', active: true, tenant_id: ALPHA },
      { id: 'ss-3', keyword: 'disabled', target_url: '/old', description: 'Old shortcut', icon: 'x', active: false, tenant_id: ALPHA },
    ],
  };
}

let base: string;
let server: Server | undefined;

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use('/api', (req, res, next) => requireCsrf(req as unknown as AuthedRequest, res, next));
app.use('/api', createApiRouter());

interface Session { session: string; csrf: string; }

async function login(email: string): Promise<Session> {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  const cookies = (res.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim());
  return {
    session: cookies.find((c) => c.startsWith('4c_session=')) || '',
    csrf: cookies.find((c) => c.startsWith('4c_csrf=')) || '',
  };
}

function authedHeaders(s: Session, mutate = true): Record<string, string> {
  const headers: Record<string, string> = { Cookie: `${s.session}; ${s.csrf}` };
  if (mutate && s.csrf) headers['X-CSRF-Token'] = s.csrf.split('=')[1];
  return headers;
}

beforeEach(async () => {
  const store = seedStore();
  Object.assign(supabase, createFakeSupabase(store));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(() => { server?.close(); });

describe('Search domain', () => {
  let adminSession: Session;
  beforeEach(async () => { adminSession = await login('admin@4core.com'); });

  describe('GET /search', () => {
    it('returns results across tickets, customers, kb, documents', async () => {
      const res = await fetch(`${base}/search?q=payment`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.query).toBe('payment');
      expect(typeof data.total).toBe('number');
      expect(typeof data.durationMs).toBe('number');
      expect(data.results.tickets).toBeDefined();
      expect(data.results.customers).toBeDefined();
      expect(data.results.kb).toBeDefined();
      expect(data.results.documents).toBeDefined();
      expect(data.results.tickets.length).toBeGreaterThanOrEqual(1);
      expect(data.results.kb.length).toBeGreaterThanOrEqual(1);
      expect(data.results.documents.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects queries under 2 chars', async () => {
      const res = await fetch(`${base}/search?q=a`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it('filters by type', async () => {
      const res = await fetch(`${base}/search?q=test&types=tickets`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.results.tickets).toBeDefined();
      expect(data.results.customers).toBeUndefined();
      expect(data.results.kb).toBeUndefined();
      expect(data.results.documents).toBeUndefined();
    });
  });

  describe('GET /search/shortcuts', () => {
    it('returns active shortcuts', async () => {
      const res = await fetch(`${base}/search/shortcuts`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      expect(data.every((s: Record<string, unknown>) => s.active === true)).toBe(true);
      expect(data.some((s: Record<string, unknown>) => s.keyword === 'payments')).toBe(true);
      expect(data.some((s: Record<string, unknown>) => s.keyword === 'users')).toBe(true);
    });
  });

  describe('GET /search/recent', () => {
    it('returns deduplicated recent searches for the user', async () => {
      const res = await fetch(`${base}/search/recent`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(3);
      const queries = data.map((r: Record<string, unknown>) => r.query);
      expect(new Set(queries).size).toBe(queries.length);
      expect(queries[0]).toBe('payment');
      expect(queries[1]).toBe('login');
      expect(queries[2]).toBe('password');
    });
  });

  describe('auth required', () => {
    it('GET /search returns 401 without session', async () => {
      const res = await fetch(`${base}/search?q=payment`);
      expect(res.status).toBe(401);
    });

    it('GET /search/shortcuts returns 401 without session', async () => {
      const res = await fetch(`${base}/search/shortcuts`);
      expect(res.status).toBe(401);
    });

    it('GET /search/recent returns 401 without session', async () => {
      const res = await fetch(`${base}/search/recent`);
      expect(res.status).toBe(401);
    });
  });
});
