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
import { requireCsrf, hashPassword } from '../../server/auth';
import { createFakeSupabase, type TableStore } from '@/tests/helpers/fakeSupabase';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

function seedStore(): TableStore {
  const pass = hashPassword(PASSWORD);
  return {
    users: [
      { id: 'usr-admin', name: 'Admin', email: 'admin@4core.com', password_hash: pass, role: 'SUPER_ADMIN', bu: 'ALL', phone: '', tenant_id: ALPHA },
      { id: 'usr-partner', name: 'Partner Agent', email: 'agent@partner.com', password_hash: pass, role: 'PARTNER', bu: 'partner-a', partner: 'partner-a', phone: '', tenant_id: ALPHA },
    ],
    tickets: [
      { id: 'tkt-p1', customer_name: 'Acme', category: 'Payment', status: 'open', priority: 'high', partner: 'partner-a', tenant_id: ALPHA, is_deleted: false, watchers: [] },
      { id: 'tkt-p2', customer_name: 'Beta', category: 'Login', status: 'resolved', priority: 'low', partner: 'partner-b', tenant_id: ALPHA, is_deleted: false, watchers: [] },
    ],
    comments: [], evidence: [], audit_logs: [], watcher_notifications: [],
    major_incidents: [], sla_rules: [], holidays: [], ticket_templates: [],
    customers: [], kb_articles: [], app_config: [],
    'partner_portal.partner_scorecards': [
      { id: 'sc-1', partner_id: 'partner-a', period_start: '2026-08-01', period_end: '2026-08-31', total_tickets: 10, resolved_tickets: 8, breached_tickets: 1, avg_resolution_hours: 4.5, sla_compliance_pct: 85.0 },
    ],
    'partner_portal.saved_replies': [
      { id: 'sr-1', partner_id: 'partner-a', title: 'Thanks', body: 'Thank you for contacting us.', created_by: 'agent@partner.com', created_at: '2026-08-20T10:00:00Z', updated_at: '2026-08-20T10:00:00Z' },
      { id: 'sr-2', partner_id: 'partner-b', title: 'Other', body: 'Other partner reply.', created_by: 'other@partner-b.com', created_at: '2026-08-20T10:00:00Z', updated_at: '2026-08-20T10:00:00Z' },
    ],
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

describe('Partner Portal', () => {
  let adminSession: Session;
  let partnerSession: Session;
  beforeEach(async () => {
    adminSession = await login('admin@4core.com');
    partnerSession = await login('agent@partner.com');
  });

  describe('GET /partner/scorecard', () => {
    it('returns scorecard for authenticated partner', async () => {
      const res = await fetch(`${base}/partner/scorecard`, { headers: authedHeaders(partnerSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.partner_id).toBe('partner-a');
    });
  });

  describe('GET /partner/scorecard/history', () => {
    it('returns historical scorecards', async () => {
      const res = await fetch(`${base}/partner/scorecard/history`, { headers: authedHeaders(partnerSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /partner/metrics', () => {
    it('returns partner metrics', async () => {
      const res = await fetch(`${base}/partner/metrics`, { headers: authedHeaders(partnerSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.partner_id).toBe('partner-a');
    });
  });

  describe('GET /partner/saved-replies', () => {
    it('returns partner-scoped saved replies only', async () => {
      const res = await fetch(`${base}/partner/saved-replies`, { headers: authedHeaders(partnerSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.every((r: any) => r.partner_id === 'partner-a')).toBe(true);
    });
  });

  describe('POST /partner/saved-replies', () => {
    it('creates a saved reply', async () => {
      const res = await fetch(`${base}/partner/saved-replies`, {
        method: 'POST',
        headers: { ...authedHeaders(partnerSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Greeting', body: 'Hello there!' }),
      });
      expect(res.status).toBe(201);
      const reply = await res.json();
      expect(reply.title).toBe('Greeting');
      expect(reply.partner_id).toBe('partner-a');
    });
  });

  describe('PATCH /partner/saved-replies/:id', () => {
    it('updates a saved reply', async () => {
      const res = await fetch(`${base}/partner/saved-replies/sr-1`, {
        method: 'PATCH',
        headers: { ...authedHeaders(partnerSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Thanks' }),
      });
      expect(res.status).toBe(200);
      const reply = await res.json();
      expect(reply.title).toBe('Updated Thanks');
    });

    it('returns 404 for other partner reply', async () => {
      const res = await fetch(`${base}/partner/saved-replies/sr-2`, {
        method: 'PATCH',
        headers: { ...authedHeaders(partnerSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Hacked' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /partner/saved-replies/:id', () => {
    it('deletes a saved reply', async () => {
      const res = await fetch(`${base}/partner/saved-replies/sr-1`, {
        method: 'DELETE',
        headers: authedHeaders(partnerSession),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for other partner reply', async () => {
      const res = await fetch(`${base}/partner/saved-replies/sr-2`, {
        method: 'DELETE',
        headers: authedHeaders(partnerSession),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /partner/tickets', () => {
    it('returns partner-scoped tickets', async () => {
      const res = await fetch(`${base}/partner/tickets`, { headers: authedHeaders(partnerSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('auth required', () => {
    it('GET /partner/scorecard returns 401', async () => {
      const res = await fetch(`${base}/partner/scorecard`);
      expect(res.status).toBe(401);
    });
  });
});
