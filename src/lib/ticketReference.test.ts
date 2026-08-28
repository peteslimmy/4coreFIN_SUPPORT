import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

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
    tickets: [],
    comments: [],
    evidence: [],
    audit_logs: [],
    watcher_notifications: [],
    major_incidents: [],
    customers: [],
    app_config: [],
    sla_rules: [],
    holidays: [],
    ticket_templates: [],
    kb_articles: [],
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
  store['ticket.categories'] = [
    { id: 'cat-1', code: 'INCIDENT', name: 'Incident', description: null, active: true, display_order: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'cat-2', code: 'COMPLAINT', name: 'Complaint', description: null, active: true, display_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ];
  store['ticket.severities'] = [
    { id: 'sev-1', code: 'LOW', name: 'Low', description: null, sort_order: 1, active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'sev-2', code: 'HIGH', name: 'High', description: null, sort_order: 3, active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ];
  store['ticket.states'] = [
    { id: 'st-1', code: 'RECEIPT', name: 'Receipt', description: null, terminal: false, active: true, created_at: '2026-01-01T00:00:00Z' },
    { id: 'st-2', code: 'CLOSED', name: 'Closed', description: null, terminal: true, active: true, created_at: '2026-01-01T00:00:00Z' },
  ];

  Object.assign(supabase, createFakeSupabase(store));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(() => { server?.close(); });

describe('Ticket reference tables', () => {
  let adminSession: Session;

  beforeEach(async () => {
    adminSession = await login('admin@4core.com');
  });

  describe('GET /ticket/categories', () => {
    it('returns list of categories', async () => {
      const res = await fetch(`${base}/ticket/categories`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((c: Record<string, unknown>) => c.code === 'INCIDENT')).toBe(true);
      expect(data.some((c: Record<string, unknown>) => c.code === 'COMPLAINT')).toBe(true);
    });
  });

  describe('POST /ticket/categories', () => {
    it('creates a new category', async () => {
      const res = await fetch(`${base}/ticket/categories`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'REQUEST', name: 'Service Request' }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.code).toBe('REQUEST');
      expect(data.name).toBe('Service Request');
    });
  });

  describe('GET /ticket/severities', () => {
    it('returns list of severities', async () => {
      const res = await fetch(`${base}/ticket/severities`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((s: Record<string, unknown>) => s.code === 'LOW')).toBe(true);
      expect(data.some((s: Record<string, unknown>) => s.code === 'HIGH')).toBe(true);
    });
  });

  describe('POST /ticket/severities', () => {
    it('creates a new severity', async () => {
      const res = await fetch(`${base}/ticket/severities`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'URGENT', name: 'Urgent', sortOrder: 5 }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.code).toBe('URGENT');
      expect(data.sortOrder).toBe(5);
    });
  });

  describe('GET /ticket/states', () => {
    it('returns list of workflow states', async () => {
      const res = await fetch(`${base}/ticket/states`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((s: Record<string, unknown>) => s.code === 'RECEIPT')).toBe(true);
      expect(data.some((s: Record<string, unknown>) => s.code === 'CLOSED')).toBe(true);
    });
  });
});
