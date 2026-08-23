import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { vi } from 'vitest';

vi.mock('../../server/supabase', () => {
  const s = { from: () => { throw new Error('not initialised'); } };
  return { supabase: s, supabaseAuth: s };
});
vi.mock('../../server/broadcast', () => ({ broadcast: vi.fn() }));
vi.mock('../../server/services/notifyEmails', () => ({ notifyByEmail: vi.fn(), appHomeUrl: () => 'http://localhost' }));

import express from 'express';
import { supabase } from '../../server/supabase';
import { createApiRouter } from '../../server/routes';
import { requireCsrf, hashPassword } from '../../server/auth';
import { createFakeSupabase, type TableStore } from '@/tests/helpers/fakeSupabase';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

const DEFAULT_RULES = [
  { id: 'esc-p1-2h', name: 'P1 after 2h', condition: { hoursFromCreation: 2, priority: 'CRITICAL' }, actions: [{ type: 'notify', target: 'ops-team', message: 'P1 alert' }] },
  { id: 'esc-unassigned-1h', name: 'Unassigned after 1h', condition: { hoursFromCreation: 1 }, actions: [{ type: 'notify', target: 'ops-team', message: 'Unassigned alert' }] },
];

function seedStore(): TableStore {
  const pass = hashPassword(PASSWORD);
  return {
    users: [
      { id: 'usr-admin', name: 'Admin', email: 'admin@4core.com', password_hash: pass, role: 'SUPER_ADMIN', bu: 'ALL', phone: '', tenant_id: ALPHA },
    ],
    tickets: [
      { id: 'tkt-old-crit', customer_name: 'Acme', category: 'Payment', status: 'open', priority: 'CRITICAL', created_at: new Date(Date.now() - 3 * 3600000).toISOString(), tenant_id: ALPHA, is_deleted: false, watchers: [] },
      { id: 'tkt-new-low', customer_name: 'Beta', category: 'Login', status: 'open', priority: 'LOW', created_at: new Date(Date.now() - 0.5 * 3600000).toISOString(), tenant_id: ALPHA, is_deleted: false, watchers: [] },
    ],
    comments: [], evidence: [], audit_logs: [], watcher_notifications: [],
    major_incidents: [], sla_rules: [], holidays: [], ticket_templates: [],
    customers: [], kb_articles: [],
    app_config: [
      { key: 'escalationRules', value: DEFAULT_RULES },
      { key: 'notificationConfigs', value: [] },
    ],
    'escalation_notification_log': [],
  };
}

let base: string;
let server: Server | undefined;

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use('/api', (req, res, next) => requireCsrf(req as any, res, next));
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

function authedHeaders(s: Session): Record<string, string> {
  const headers: Record<string, string> = { Cookie: `${s.session}; ${s.csrf}` };
  if (s.csrf) headers['X-CSRF-Token'] = s.csrf.split('=')[1];
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

describe('Escalation Engine', () => {
  let adminSession: Session;
  beforeEach(async () => { adminSession = await login('admin@4core.com'); });

  describe('GET /escalation/rules', () => {
    it('returns seeded escalation rules', async () => {
      const res = await fetch(`${base}/escalation/rules`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      expect(data.some((r: any) => r.id === 'esc-p1-2h')).toBe(true);
    });
  });

  describe('POST /escalation/rules', () => {
    it('creates a new rule', async () => {
      const res = await fetch(`${base}/escalation/rules`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'P2 after 3h', condition: { hoursFromCreation: 3, priority: 'HIGH' }, actions: [{ type: 'notify', target: 'ops-team' }] }),
      });
      expect(res.status).toBe(201);
      const rule = await res.json();
      expect(rule.name).toBe('P2 after 3h');
      expect(rule.id).toBeDefined();
    });

    it('rejects duplicate rule id', async () => {
      const res = await fetch(`${base}/escalation/rules`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'esc-p1-2h', name: 'Dup', condition: { hoursFromCreation: 1 }, actions: [{ type: 'notify' }] }),
      });
      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /escalation/rules/:id', () => {
    it('updates an existing rule', async () => {
      const res = await fetch(`${base}/escalation/rules/esc-p1-2h`, {
        method: 'PATCH',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated P1 rule' }),
      });
      expect(res.status).toBe(200);
      const rule = await res.json();
      expect(rule.name).toBe('Updated P1 rule');
    });

    it('returns 404 for unknown rule', async () => {
      const res = await fetch(`${base}/escalation/rules/nonexistent`, {
        method: 'PATCH',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /escalation/rules/:id', () => {
    it('deletes a rule', async () => {
      const res = await fetch(`${base}/escalation/rules/esc-p1-2h`, {
        method: 'DELETE',
        headers: authedHeaders(adminSession),
      });
      expect(res.status).toBe(204);
      const list = await fetch(`${base}/escalation/rules`, { headers: authedHeaders(adminSession) });
      const rules = await list.json();
      expect(rules.length).toBe(1);
    });

    it('returns 404 for unknown rule', async () => {
      const res = await fetch(`${base}/escalation/rules/nonexistent`, {
        method: 'DELETE',
        headers: authedHeaders(adminSession),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /escalation/check', () => {
    it('manually triggers escalation check', async () => {
      const res = await fetch(`${base}/escalation/check`, {
        method: 'POST',
        headers: authedHeaders(adminSession),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.escalated).toBe('number');
      expect(typeof data.scanned).toBe('number');
    });
  });

  describe('GET /escalation/log', () => {
    it('returns escalation log entries', async () => {
      const res = await fetch(`${base}/escalation/log`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('auth required', () => {
    it('GET /escalation/rules returns 401', async () => {
      const res = await fetch(`${base}/escalation/rules`);
      expect(res.status).toBe(401);
    });
  });
});
