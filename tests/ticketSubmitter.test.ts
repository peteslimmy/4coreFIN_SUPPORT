import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import express from 'express';
import { createApiRouter } from '../server/routes';
import { requireCsrf } from '../server/auth';
import { createTestUser } from './helpers/testUsers';
import { supabase } from './helpers/testDb';
import './helpers/conftest';

const PASSWORD = 'password123';

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

async function seedStaffAndCustomer() {
  await createTestUser({
    id: 'usr-officer',
    name: 'Officer Ada',
    email: 'officer@4core.com',
    password: PASSWORD,
    role: 'BU_SUPPORT',
    bu: 'ALPHA',
    phone: '',
  });
  await createTestUser({
    id: 'usr-cust',
    name: 'Dormant Customer',
    email: 'customer@4core.com',
    password: PASSWORD,
    role: 'CUSTOMER',
    bu: 'ALPHA',
    phone: '',
  });
}

beforeEach(async () => {
  await seedStaffAndCustomer();
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

describe('Staff-on-behalf-of-customer identity separation', () => {
  it('stamps the logging officer while keeping the customer identity from the body', async () => {
    const s = await login('officer@4core.com');
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Chinedu Okonkwo',
        customerEmail: 'chinedu@example.com',
        customerPhone: '+2348000000000',
        businessUnit: 'ALPHA',
        category: 'Payment Dispute',
        priority: 'HIGH',
        description: 'Identity separation test',
      }),
    });
    expect(res.status).toBe(201);
    const ticket = await res.json();

    expect(ticket.customerName).toBe('Chinedu Okonkwo');
    expect(ticket.customerEmail).toBe('chinedu@example.com');
    expect(ticket.submittedBy).toBe('BU_SUPPORT');
    expect(ticket.submittedByName).toBe('Officer Ada');
    expect(ticket.customerId).toBeTruthy();

    const customersRes = await fetch(`${base}/customers`, { headers: authedHeaders(s, false) });
    expect(customersRes.status).toBe(200);
    const customers = await customersRes.json();
    const created = customers.find((c: any) => c.email === 'chinedu@example.com');
    expect(created).toBeTruthy();
    expect(created.phone).toBe('+2348000000000');
    expect(created.firstName).toBe('Chinedu');
    expect(created.lastName).toBe('Okonkwo');
    expect(customers.some((c: any) => c.email === 'officer@4core.com')).toBe(false);

    const { data: stored } = await supabase.from('customers').select('email').ilike('email', 'chinedu@example.com');
    expect(stored?.length).toBe(1);
  });

  it('preserves explicitly provided submittedBy and submittedByName', async () => {
    const s = await login('officer@4core.com');
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'E2E Carol',
        customerEmail: 'carol@example.com',
        businessUnit: 'ALPHA',
        category: 'Payment Dispute',
        priority: 'HIGH',
        description: 'Explicit submitter test',
        submittedBy: 'CUSTOMER',
        submittedByName: 'E2E Carol',
      }),
    });
    expect(res.status).toBe(201);
    const ticket = await res.json();
    expect(ticket.submittedBy).toBe('CUSTOMER');
    expect(ticket.submittedByName).toBe('E2E Carol');
  });

  it('does not stamp the officer for the dormant CUSTOMER self-service path', async () => {
    const s = await login('customer@4core.com');
    const res = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Ada Lovelace',
        customerEmail: 'ada@example.com',
        businessUnit: 'ALPHA',
        category: 'Payment Dispute',
        priority: 'HIGH',
        description: 'Self-service test',
        submittedBy: 'CUSTOMER',
      }),
    });
    expect(res.status).toBe(201);
    const ticket = await res.json();
    expect(ticket.submittedBy).toBe('CUSTOMER');
    expect(ticket.submittedByName).toBeFalsy();
  });
});