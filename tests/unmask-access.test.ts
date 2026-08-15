import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

vi.mock('../server/supabase', () => {
  const s = { from: () => { throw new Error('supabase not initialised in this test'); } };
  return { supabase: s, supabaseAuth: s };
});

import express from 'express';
import { supabase } from '../server/supabase';
import { createApiRouter } from '../server/routes';
import { requireCsrf, hashPassword } from '../server/auth';
import { createFakeSupabase, type TableStore } from './helpers/fakeSupabase';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';
const PAN = '4111111111111111';

function seedStore(withPan: string): TableStore {
  const pass = hashPassword(PASSWORD);
  return {
    users: [
      { id: 'usr-sup', name: 'Admin', email: 'admin@4core.com', password_hash: pass, role: 'SUPER_ADMIN', bu: 'ALL', phone: '', tenant_id: ALPHA },
      { id: 'usr-bu', name: 'Alice Alpha', email: 'alice@alpha.com', password_hash: pass, role: 'BU_SUPPORT', bu: 'ALPHA', phone: '', tenant_id: ALPHA },
      { id: 'usr-rep', name: 'Paystack Rep', email: 'rep@paystack.com', password_hash: pass, role: 'PARTNER', bu: 'Paystack', phone: '', tenant_id: ALPHA },
    ],
    tickets: [
      { id: 'tkt-pan1', business_unit: 'ALPHA', tenant_id: ALPHA, partner: 'Paystack', category: 'Payment Dispute', issue_type: 'Payment Dispute', priority: 'HIGH', status: 'RECEIPT', is_deleted: false, created_at: '2026-07-01T00:00:00Z', sla_deadline: '2026-07-10T00:00:00Z', customer_name: 'Faith', customer_email: 'faith@example.com', customer_phone: '08012345678', customer_last_name: '', customer_id: null, amount: 100, transaction_id: 'TX1', card_pan: withPan, description: '', bank_name: '', is_escalated: false, escalation_count: 0, assigned_agent_id: '', major_incident_id: null, feedback_score: null, feedback_comment: null, root_cause: null, corrective_action: null, submitted_by: 'BU_SUPPORT', submitted_by_name: '', submitted_by_phone: '', watchers: [], rca_details: null, custom_fields: {}, duplicate_of: null },
    ],
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
app.use(express.json({ limit: '5mb' }));
app.use('/api', (req, res, next) => requireCsrf(req as any, res, next));
app.use('/api', createApiRouter());

interface Session {
  session: string;
  csrf: string;
}

async function login(email: string): Promise<Session> {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  const cookies = (res.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim());
  const session = cookies.find((c) => c.startsWith('4c_session=')) || '';
  const csrf = cookies.find((c) => c.startsWith('4c_csrf=')) || '';
  return { session, csrf };
}

function authedHeaders(s: Session, mutate = true): Record<string, string> {
  const headers: Record<string, string> = { Cookie: `${s.session}; ${s.csrf}` };
  if (mutate && s.csrf) headers['X-CSRF-Token'] = s.csrf.split('=')[1];
  return headers;
}

beforeEach(async () => {
  Object.assign(supabase, createFakeSupabase(seedStore(PAN)));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe('Unmask access control — SEC-18 regression', () => {
  it('forbids a PARTNER from unmasking via ?unmask=true on the list route', async () => {
    const s = await login('rep@paystack.com');
    const res = await fetch(`${base}/tickets?unmask=true`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(403);
  });

  it('forbids a PARTNER from unmasking a single ticket', async () => {
    const s = await login('rep@paystack.com');
    const res = await fetch(`${base}/tickets/tkt-pan1?unmask=true`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(403);
  });

  it('still lets a PARTNER view a masked ticket (default view)', async () => {
    const s = await login('rep@paystack.com');
    const res = await fetch(`${base}/tickets/tkt-pan1`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const ticket = (await res.json()) as any;
    expect(ticket.cardPan).not.toBe(PAN);
  });

  it('lets a BU_SUPPORT role (holds tickets:unmask) unmask on the list route', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets?unmask=true`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const tickets = (await res.json()) as any[];
    expect(tickets.find((t) => t.id === 'tkt-pan1').cardPan).toBe(PAN);
  });

  it('lets a BU_SUPPORT role unmask a single ticket', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets/tkt-pan1?unmask=true`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const ticket = (await res.json()) as any;
    expect(ticket.cardPan).toBe(PAN);
  });
});

describe('Create-ticket validation — SEC-56 regression', () => {
  it('rejects an empty create body with 400 (not 500)', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toMatch(/customer email is required|business unit is required/i);
  });

  it('returns 400 when customerEmail is missing', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessUnit: 'ALPHA' }),
    });
    expect(res.status).toBe(400);
  });

  it('still allows a valid create (customerEmail + businessUnit present)', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'tkt-sec56-ok',
        customerName: 'Validation Customer',
        customerEmail: 'validation@test.com',
        businessUnit: 'ALPHA',
        slaDeadline: '2026-07-15T00:00:00Z',
      }),
    });
    expect(res.status).toBe(201);
  });
});