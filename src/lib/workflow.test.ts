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
import { requireCsrf, hashPassword } from '../../server/auth';
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
    'workflow.states': [
      { id: 'ws-1', code: 'RECEIPT', name: 'Receipt', terminal: false, active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'ws-2', code: 'ASSIGNED', name: 'Assigned', terminal: false, active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'ws-3', code: 'INVESTIGATE', name: 'Investigating', terminal: false, active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'ws-4', code: 'WAITING_CUSTOMER', name: 'Waiting Customer', terminal: false, active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'ws-5', code: 'WAITING_PARTNER', name: 'Waiting Partner', terminal: false, active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'ws-6', code: 'WAITING_INTERNAL', name: 'Waiting Internal', terminal: false, active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'ws-7', code: 'RESOLVED', name: 'Resolved', terminal: false, active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'ws-8', code: 'CLOSED', name: 'Closed', terminal: true, active: true, created_at: '2026-01-01T00:00:00Z' },
    ],
    'workflow.transitions': [
      { id: 'wt-1', from_state_id: 'ws-1', to_state_id: 'ws-2', command_code: 'ASSIGNED', name: 'Assign', active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wt-2', from_state_id: 'ws-2', to_state_id: 'ws-3', command_code: 'BEGIN_INVESTIGATION', name: 'Start Investigation', active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wt-3', from_state_id: 'ws-3', to_state_id: 'ws-4', command_code: 'WAIT_CUSTOMER', name: 'Wait for Customer', active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wt-4', from_state_id: 'ws-3', to_state_id: 'ws-5', command_code: 'WAIT_PARTNER', name: 'Wait for Partner', active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wt-5', from_state_id: 'ws-3', to_state_id: 'ws-6', command_code: 'WAIT_INTERNAL', name: 'Wait Internal', active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wt-6', from_state_id: 'ws-4', to_state_id: 'ws-3', command_code: 'CUSTOMER_REPLIED', name: 'Customer Replied', active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wt-7', from_state_id: 'ws-5', to_state_id: 'ws-3', command_code: 'PARTNER_REPLIED', name: 'Partner Replied', active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wt-8', from_state_id: 'ws-6', to_state_id: 'ws-3', command_code: 'INTERNAL_RESUMED', name: 'Resume Investigation', active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wt-9', from_state_id: 'ws-3', to_state_id: 'ws-7', command_code: 'RESOLVE', name: 'Resolve', active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wt-10', from_state_id: 'ws-7', to_state_id: 'ws-8', command_code: 'CLOSE', name: 'Close', active: true, created_at: '2026-01-01T00:00:00Z' },
    ],
    'workflow.transition_rules': [
      { id: 'wr-1', transition_id: 'wt-1', role_code: 'SUPER_ADMIN', requires_fields: [], active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wr-2', transition_id: 'wt-1', role_code: 'BU_SUPPORT', requires_fields: [], active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wr-3', transition_id: 'wt-9', role_code: 'SUPER_ADMIN', requires_fields: ['rootCause', 'correctiveActions', 'preventiveActions', 'preventiveOwner', 'preventiveDueDate'], active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'wr-4', transition_id: 'wt-9', role_code: 'PARTNER', requires_fields: ['rootCause', 'correctiveActions', 'preventiveActions', 'preventiveOwner', 'preventiveDueDate'], active: true, created_at: '2026-01-01T00:00:00Z' },
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

describe('Workflow domain', () => {
  let adminSession: Session;

  beforeEach(async () => {
    adminSession = await login('admin@4core.com');
  });

  describe('GET /workflow/states', () => {
    it('returns list of workflow states', async () => {
      const res = await fetch(`${base}/workflow/states`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data.some((s: any) => s.code === 'RECEIPT')).toBe(true);
      expect(data.some((s: any) => s.code === 'CLOSED')).toBe(true);
    });
  });

  describe('GET /workflow/states/:id', () => {
    it('returns a single state', async () => {
      const res = await fetch(`${base}/workflow/states/ws-1`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.code).toBe('RECEIPT');
    });

    it('returns 404 for unknown state', async () => {
      const res = await fetch(`${base}/workflow/states/nonexistent`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /workflow/states', () => {
    it('creates a new workflow state', async () => {
      const res = await fetch(`${base}/workflow/states`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'CUSTOM', name: 'Custom State' }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.code).toBe('CUSTOM');
      expect(data.terminal).toBe(false);
    });
  });

  describe('GET /workflow/transitions', () => {
    it('returns list of transitions', async () => {
      const res = await fetch(`${base}/workflow/transitions`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data.some((t: any) => t.command_code === 'ASSIGNED')).toBe(true);
    });
  });

  describe('GET /workflow/transitions/:id', () => {
    it('returns a single transition', async () => {
      const res = await fetch(`${base}/workflow/transitions/wt-1`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.command_code).toBe('ASSIGNED');
    });

    it('returns 404 for unknown transition', async () => {
      const res = await fetch(`${base}/workflow/transitions/nonexistent`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /workflow/rules', () => {
    it('returns list of transition rules', async () => {
      const res = await fetch(`${base}/workflow/rules`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data.some((r: any) => r.role_code === 'SUPER_ADMIN')).toBe(true);
    });
  });

  describe('POST /workflow/rules', () => {
    it('creates a new transition rule', async () => {
      const res = await fetch(`${base}/workflow/rules`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ transitionId: 'wt-2', roleCode: 'PARTNER', requiresFields: [] }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.transition_id).toBe('wt-2');
      expect(data.role_code).toBe('PARTNER');
    });
  });

  describe('DELETE /workflow/rules/:id', () => {
    it('deletes a transition rule', async () => {
      const res = await fetch(`${base}/workflow/rules/wr-1`, {
        method: 'DELETE',
        headers: authedHeaders(adminSession),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('returns 404 for unknown rule', async () => {
      const res = await fetch(`${base}/workflow/rules/nonexistent`, {
        method: 'DELETE',
        headers: authedHeaders(adminSession),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /workflow/available/:ticketStateCode', () => {
    it('returns transitions from RECEIPT state', async () => {
      const res = await fetch(`${base}/workflow/available/RECEIPT`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].command_code).toBe('ASSIGNED');
    });

    it('returns transitions from INVESTIGATE state', async () => {
      const res = await fetch(`${base}/workflow/available/INVESTIGATE`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(4);
      const codes = data.map((t: any) => t.command_code).sort();
      expect(codes).toEqual(['RESOLVE', 'WAIT_CUSTOMER', 'WAIT_INTERNAL', 'WAIT_PARTNER']);
    });

    it('returns 404 for unknown state', async () => {
      const res = await fetch(`${base}/workflow/available/UNKNOWN`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(404);
    });
  });
});
