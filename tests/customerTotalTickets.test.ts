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

function seedStore(): TableStore {
  const pass = hashPassword(PASSWORD);
  return {
    users: [
      { id: 'usr-admin', name: 'Admin', email: 'admin@4core.com', password_hash: pass, role: 'SUPER_ADMIN', bu: 'ALL', phone: '', tenant_id: ALPHA },
    ],
    tickets: [
      { id: 'tkt-c1', business_unit: 'ALPHA', tenant_id: ALPHA, partner: '', category: 'Payment Dispute', issue_type: 'Payment Dispute', priority: 'HIGH', status: 'RECEIPT', is_deleted: false, created_at: '2026-07-01T00:00:00Z', sla_deadline: '2026-07-10T00:00:00Z', customer_name: 'Ada', customer_email: 'ada@example.com', customer_phone: '', customer_last_name: '', customer_id: 'cst-ada', amount: 0, transaction_id: '', card_pan: '****', description: '', bank_name: '', is_escalated: false, escalation_count: 0, assigned_agent_id: '', major_incident_id: null, feedback_score: null, feedback_comment: null, root_cause: null, corrective_action: null, submitted_by: 'BU_SUPPORT', submitted_by_name: '', submitted_by_phone: '', watchers: [], rca_details: null, custom_fields: {}, duplicate_of: null },
    ],
    comments: [],
    evidence: [],
    audit_logs: [],
    watcher_notifications: [],
    major_incidents: [],
    customers: [
      { id: 'cst-ada', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', phone: '', business_unit: 'ALPHA', tenant_id: ALPHA, created_at: '2026-01-01T00:00:00Z', total_tickets: 0, notes: null },
    ],
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

interface Session { session: string; csrf: string; }

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
  Object.assign(supabase, createFakeSupabase(seedStore()));
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

describe('Customer totalTickets denormalization', () => {
  it('is computed from the linked ticket count when no stored value exists', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/customers`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const customers = await res.json();
    expect(customers.length).toBeGreaterThanOrEqual(1);
    const ada = customers.find((c: any) => c.id === 'cst-ada');
    expect(ada).toBeTruthy();
    expect(ada.totalTickets).toBe(1);
  });

  it('can be recalculated explicitly via recalcCustomerTotalTickets', async () => {
    const s = await login('admin@4core.com');
    // Verify the linked-ticket path works: create a second ticket for cst-ada
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: 'Ada', customerEmail: 'ada@example.com', businessUnit: 'ALPHA', category: 'Payment Dispute', priority: 'HIGH' }),
    });
    expect(res.status).toBe(201);
    const ticket = await res.json();
    expect(ticket.customerId).toBe('cst-ada');

    // recalcCustomerTotalTickets runs automatically inside upsertTicket;
    // verify via the list endpoint which reads the stored counter
    const listRes = await fetch(`${base}/customers`, { headers: authedHeaders(s, false) });
    const customers = await listRes.json();
    const ada = customers.find((c: any) => c.id === 'cst-ada');
    expect(ada.totalTickets).toBe(2);
  });
});