import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import express from 'express';
import { createApiRouter } from '../server/routes';
import { requireCsrf } from '../server/auth';
import { resetDatabase, insertRows } from './helpers/testDb';
import { createTestUser } from './helpers/testUsers';
import { ticketRow } from './helpers/testSeeds';
import { supabase } from '../server/supabase';
import './helpers/conftest';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

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

async function seedBaseStore() {
  await createTestUser({
    id: 'usr-a',
    name: 'Alice Alpha',
    email: 'alice@alpha.com',
    password: PASSWORD,
    role: 'BU_SUPPORT',
    bu: 'ALPHA',
    phone: '',
  });
  await createTestUser({
    id: 'usr-admin',
    name: 'Admin',
    email: 'admin@4core.com',
    password: PASSWORD,
    role: 'SUPER_ADMIN',
    bu: 'ALL',
    phone: '',
  });
  await insertRows('customers', [
    {
      id: 'cst-a1',
      first_name: 'Faith',
      last_name: 'Adeleke',
      email: 'faith@example.com',
      phone: '',
      business_unit: 'ALPHA',
      tenant_id: ALPHA,
      created_at: '2026-01-01T00:00:00Z',
      total_tickets: 1,
      notes: null,
    },
  ]);
  const tkt = await ticketRow({
    id: 'tkt-a1',
    business_unit: 'ALPHA',
    provider: 'Paystack',
    category: 'Payment Dispute',
    issue_type: 'Payment Dispute',
    priority: 'HIGH',
    status: 'INVESTIGATE',
    is_deleted: false,
    created_at: '2026-07-01T00:00:00Z',
    sla_deadline: '2026-07-10T00:00:00Z',
    customer_name: 'Faith',
    customer_email: 'faith@example.com',
    customer_phone: '',
    customer_last_name: '',
    customer_id: null,
    amount: 100,
    transaction_id: 'TX1',
    card_pan: '****',
    description: '',
    is_escalated: false,
    escalation_count: 0,
    assigned_agent_id: '',
    major_incident_id: null,
    watchers: [],
  });
  await insertRows('tickets', [tkt]);
}

async function seedTicket(id: string, fixture: any) {
  const row = await ticketRow({ id, ...fixture });
  await insertRows('tickets', [row]);
}

beforeEach(async () => {
  await resetDatabase();
  await seedBaseStore();
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

async function customersRows() {
  const { data } = await supabase.from('customers').select('*');
  return data as any[];
}

describe('Customer auto-link on ticket creation', () => {
  it('creates a customer from a new email and stamps customer_id', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: 'New Person', customerEmail: 'new@example.com', customerPhone: '+234-1', businessUnit: 'ALPHA', category: 'Payment Dispute', priority: 'HIGH' }),
    });
    expect(res.status).toBe(201);
    const ticket = (await res.json()) as any;
    expect(ticket.customerId).toBeTruthy();

    const customers = await customersRows();
    const created = customers.find((c) => c.email === 'new@example.com');
    expect(created).toBeTruthy();
    expect(created.business_unit).toBe('ALPHA');
    expect(created.first_name).toBe('New');
    expect(created.last_name).toBe('Person');
    expect(created.tenant_id).toBe(ALPHA);
    expect(ticket.customerId).toBe(created.id);
  });

  it('reuses an existing customer by email instead of duplicating', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: 'Faith Adeleke', customerEmail: 'faith@example.com', businessUnit: 'ALPHA', category: 'Payment Dispute', priority: 'HIGH' }),
    });
    expect(res.status).toBe(201);
    const ticket = (await res.json()) as any;
    expect(ticket.customerId).toBe('cst-a1');
    expect((await customersRows()).length).toBe(1);
  });

  it('keeps the same email as distinct customers across business units', async () => {
    const s = await login('admin@4core.com');
    const first = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerEmail: 'shared@example.com', businessUnit: 'ALPHA', category: 'Payment Dispute', priority: 'HIGH' }),
    });
    const second = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerEmail: 'shared@example.com', businessUnit: 'BETA', category: 'Technical Issue', priority: 'MEDIUM' }),
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const t1 = (await first.json()) as any;
    const t2 = (await second.json()) as any;
    expect(t1.customerId).not.toBe(t2.customerId);

    const customers = await customersRows();
    const shared = customers.filter((c) => c.email === 'shared@example.com');
    expect(shared.length).toBe(2);
    expect(shared.map((c) => c.business_unit).sort()).toEqual(['ALPHA', 'BETA']);
  });

  it('links a legacy email-only ticket when patched', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets/tkt-a1`, {
      method: 'PATCH',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'follow-up' }),
    });
    expect(res.status).toBe(200);
    const ticket = (await res.json()) as any;
    expect(ticket.customerId).toBe('cst-a1');
    const { data } = await supabase.from('tickets').select('*').eq('id', 'tkt-a1');
    expect((data as any[])[0].customer_id).toBe('cst-a1');
  });
});

describe('Customer delete guard', () => {
  it('blocks deleting a customer referenced by tickets with 409', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/customers/cst-a1`, {
      method: 'DELETE',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.referencedBy.tickets).toBe(1);
    expect((await customersRows()).length).toBe(1);
  });

  it('allows deleting a customer with no linked tickets', async () => {
    await insertRows('customers', [
      {
        id: 'cst-empty',
        first_name: 'Orphan',
        last_name: 'Row',
        email: 'orphan@example.com',
        phone: '',
        business_unit: 'ALPHA',
        tenant_id: ALPHA,
        created_at: '2026-01-01T00:00:00Z',
        total_tickets: 0,
        notes: null,
      },
    ]);
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/customers/cst-empty`, {
      method: 'DELETE',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(200);
    expect((await customersRows()).length).toBe(0);
  });
});

describe('Customer totalTickets derivation', () => {
  it('computes totalTickets from linked tickets (id + email fallback)', async () => {
    await seedTicket('tkt-a2', {
      business_unit: 'ALPHA',
      provider: 'Paystack',
      category: 'Technical Issue',
      issue_type: 'Technical Issue',
      priority: 'MEDIUM',
      status: 'ASSIGNED',
      is_deleted: false,
      created_at: '2026-07-02T00:00:00Z',
      sla_deadline: '2026-07-11T00:00:00Z',
      customer_name: 'Faith',
      customer_email: 'faith@example.com',
      customer_phone: '',
      customer_last_name: '',
      customer_id: 'cst-a1',
      transaction_id: 'TX2',
      watchers: [],
    });
    await seedTicket('tkt-a3', {
      business_unit: 'ALPHA',
      provider: 'Paystack',
      category: 'Account Issue',
      issue_type: 'Account Issue',
      priority: 'LOW',
      status: 'RECEIPT',
      is_deleted: false,
      created_at: '2026-07-03T00:00:00Z',
      sla_deadline: '2026-07-13T00:00:00Z',
      customer_name: 'Faith',
      customer_email: 'faith@example.com',
      customer_phone: '',
      customer_last_name: '',
      customer_id: 'cst-a1',
      transaction_id: 'TX3',
      watchers: [],
    });
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/customers`, { headers: authedHeaders(s) });
    expect(res.status).toBe(200);
    const customers = (await res.json()) as any[];
    const faith = customers.find((c) => c.id === 'cst-a1');
    expect(faith.totalTickets).toBe(3);
  });
});