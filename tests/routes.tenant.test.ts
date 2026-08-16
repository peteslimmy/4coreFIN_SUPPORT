import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import express from 'express';
import { createApiRouter } from '../server/routes';
import { requireCsrf, computeAuditHash } from '../server/compliance';
import { resetDatabase, insertRows, supabase } from './helpers/testDb';
import { createTestUser } from './helpers/testUsers';
import { ticketRow } from './helpers/testSeeds';
import './helpers/conftest';

const ALPHA = 'tnt-ALPHA';
const BETA = 'tnt-BETA';
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

function authedHeaders(s: Session, mutate = true): Record<string, string> {
  const headers: Record<string, string> = { Cookie: `${s.session}; ${s.csrf}` };
  if (mutate && s.csrf) headers['X-CSRF-Token'] = s.csrf.split('=')[1];
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
  await createTestUser({
    id: 'usr-provider',
    name: 'Paystack Rep',
    email: 'rep@paystack.com',
    password: PASSWORD,
    role: 'PARTNER',
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
  const tickets = [
    await ticketRow({
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
    }),
    await ticketRow({
      id: 'tkt-b1',
      business_unit: 'BETA',
      provider: 'Flutterwave',
      category: 'Technical Issue',
      issue_type: 'Technical Issue',
      priority: 'MEDIUM',
      status: 'RECEIPT',
      is_deleted: false,
      created_at: '2026-07-02T00:00:00Z',
      sla_deadline: '2026-07-12T00:00:00Z',
      customer_name: 'Bayo',
      customer_email: 'bayo@example.com',
      customer_phone: '',
      customer_last_name: '',
      customer_id: null,
      amount: 0,
      transaction_id: 'TX2',
      card_pan: '****',
      description: '',
      is_escalated: false,
      escalation_count: 0,
      assigned_agent_id: '',
      major_incident_id: null,
      watchers: [],
    }),
  ];
  await insertRows('tickets', tickets);
  await insertRows('comments', [
    {
      id: 'cmt-a1',
      ticket_id: 'tkt-a1',
      tenant_id: ALPHA,
      author: 'Alice Alpha',
      role: 'BU_SUPPORT',
      message: 'hello',
      timestamp: '2026-07-01T00:00:00Z',
      is_internal: false,
      seen: false,
      parent_comment_id: null,
      seen_by: [],
    },
  ]);
  await insertRows('evidence', [
    {
      id: 'ev-a1',
      ticket_id: 'tkt-a1',
      tenant_id: ALPHA,
      file_name: 'a.png',
      file_size: 1,
      file_type: 'image/png',
      uploaded_at: '2026-07-01T00:00:00Z',
      uploaded_by: 'Alice Alpha',
      url: 'https://x/a.png',
    },
  ]);
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

describe('Tenant isolation — tickets', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await fetch(`${base}/tickets`);
    expect(res.status).toBe(401);
  });

  it('returns only the BU_SUPPORT user’s tenant tickets', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const tickets = (await res.json()) as any[];
    expect(tickets.map((t) => t.id).sort()).toEqual(['tkt-a1']);
  });

  it('returns all tenants for SUPER_ADMIN', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/tickets`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const tickets = (await res.json()) as any[];
    expect(tickets.map((t) => t.id).sort()).toEqual(['tkt-a1', 'tkt-b1']);
  });

  it('returns only matching partner tickets for PARTNER', async () => {
    const s = await login('rep@paystack.com');
    const res = await fetch(`${base}/tickets`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const tickets = (await res.json()) as any[];
    expect(tickets.map((t) => t.id)).toEqual(['tkt-a1']);
  });

  it('hides another tenant’s ticket on GET by id', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets/tkt-b1`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(404);
  });
});

describe('Tenant isolation — write paths', () => {
  it('rejects PATCH of another tenant’s ticket', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets/tkt-b1`, {
      method: 'PATCH',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLOSED' }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects DELETE of another tenant’s ticket', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets/tkt-b1`, {
      method: 'DELETE',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(404);
  });

  it('allows a tenant-scoped user to patch their own ticket', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets/tkt-a1`, {
      method: 'PATCH',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLOSED' }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects PATCH of another tenant’s comment', async () => {
    const s = await login('alice@alpha.com');
    await insertRows('comments', [
      {
        id: 'cmt-b1',
        ticket_id: 'tkt-b1',
        tenant_id: BETA,
        author: 'Beta',
        role: 'BU_SUPPORT',
        message: 'x',
        timestamp: '2026-07-01T00:00:00Z',
        is_internal: false,
        seen: false,
        parent_comment_id: null,
        seen_by: [],
      },
    ]);
    const res = await fetch(`${base}/comments/cmt-b1`, {
      method: 'PATCH',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'edited' }),
    });
    expect(res.status).toBe(404);
  });

  it('blocks state-changing requests without a CSRF token', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/tickets/tkt-a1`, {
      method: 'PATCH',
      headers: {
        Cookie: `${s.session}; ${s.csrf}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'CLOSED' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('Tenant isolation — related resources', () => {
  it('scopes comments and evidence to the tenant', async () => {
    const s = await login('alice@alpha.com');
    const commentsRes = await fetch(`${base}/tickets/tkt-a1/comments`, { headers: authedHeaders(s, false) });
    expect(commentsRes.status).toBe(200);
    const comments = (await commentsRes.json()) as any[];
    expect(comments.map((c) => c.id)).toEqual(['cmt-a1']);

    const evRes = await fetch(`${base}/tickets/tkt-a1/evidence`, { headers: authedHeaders(s, false) });
    expect(evRes.status).toBe(200);
    const evidence = (await evRes.json()) as any[];
    expect(evidence.map((e) => e.id)).toEqual(['ev-a1']);
  });

  it('hides another tenant’s customer from CRUD', async () => {
    await insertRows('customers', [
      {
        id: 'cst-b1',
        first_name: 'Bayo',
        last_name: 'Jegede',
        email: 'bayo@example.com',
        phone: '',
        business_unit: 'BETA',
        tenant_id: BETA,
        created_at: '2026-01-02T00:00:00Z',
        total_tickets: 1,
        notes: null,
      },
    ]);
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/customers/cst-b1`, {
      method: 'DELETE',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(404);
  });
});

describe('Config dispatcher — tables and keys share one route', () => {
  it('serves table configs via GET /config/:name', async () => {
    await insertRows('sla_rules', [
      { id: 'sla-1', category: 'Payment Dispute', priority: 'HIGH', duration_hours: 24 },
    ]);
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/config/sla_rules`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as any[];
    expect(rows.map((r) => r.id)).toEqual(['sla-1']);
  });

  it('serves scalar keys via GET /config/:name', async () => {
    await supabase.from('app_config').upsert({ key: 'businessUnits', value: ['ALPHA', 'BETA'] }, { onConflict: 'key' });
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/config/businessUnits`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const value = (await res.json()) as any[];
    expect(value).toEqual(['ALPHA', 'BETA']);
  });

  it('persists table configs via PUT /config/:name', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/config/holidays`, {
      method: 'PUT',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: 'h-1', name: 'New Year', date: '2027-01-01', country: 'NG' }]),
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('holidays').select('*');
    expect((data as any[]).length).toBe(1);
  });

  it('rejects unknown config names', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/config/doesNotExist`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(404);
  });
});

describe('Bootstrap route', () => {
  it('returns tenant-scoped data for a BU_SUPPORT user', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/bootstrap`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tickets.map((t: any) => t.id).sort()).toEqual(['tkt-a1']);
    expect(body.comments.map((c: any) => c.id)).toEqual(['cmt-a1']);
    expect(body.evidence.map((e: any) => e.id)).toEqual(['ev-a1']);
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.map((u: any) => u.id).sort()).toEqual(['usr-a', 'usr-admin', 'usr-provider']);
    expect(Array.isArray(body.slaRules)).toBe(true);
    expect(Array.isArray(body.businessUnits)).toBe(true);
    expect(Array.isArray(body.roles)).toBe(true);
  });

  it('includes admin-only users for SUPER_ADMIN', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/bootstrap`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tickets.map((t: any) => t.id).sort()).toEqual(['tkt-a1', 'tkt-b1']);
    expect(body.users.map((u: any) => u.id).sort()).toEqual(['usr-a', 'usr-admin', 'usr-provider']);
  });
});

describe('POST /api/audit-log', () => {
  it('appends a server-computed hash-chained entry', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/audit-log`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: 'tkt-a1', action: 'TICKET_COMMENTED', details: 'Test audit entry' }),
    });
    expect(res.status).toBe(201);
    const entry = (await res.json()) as any;
    expect(entry.id).toBeTruthy();
    expect(entry.previousHash).toBe('');
    expect(entry.hash).toBe(
      computeAuditHash({
        id: entry.id,
        timestamp: entry.timestamp,
        ticketId: entry.ticketId,
        actor: 'Alice Alpha',
        role: 'BU_SUPPORT',
        action: entry.action,
        details: entry.details,
        previousHash: '',
      })
    );
    const { data } = await supabase.from('audit_logs').select('*');
    expect((data as any[]).length).toBe(1);
  });
});

describe('Evidence upload bounds', () => {
  it('rejects uploads missing metadata headers', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/evidence/upload`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'image/png' },
      body: Buffer.from('x'),
    });
    expect(res.status).toBe(400);
  });

  it('rejects unsupported file types', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/evidence/upload`, {
      method: 'POST',
      headers: {
        ...authedHeaders(s),
        'Content-Type': 'application/octet-stream',
        'x-ticket-id': 'tkt-a1',
        'x-filename': 'malware.exe',
      },
      body: Buffer.from('MZ'),
    });
    expect(res.status).toBe(415);
  });
});

describe('Notification read endpoint', () => {
  it('marks a notification read via PATCH /notifications/:id/read', async () => {
    await insertRows('watcher_notifications', [
      {
        id: 'wn-1',
        ticket_id: 'tkt-a1',
        tenant_id: ALPHA,
        message: 'hi',
        recipient: 'alice@alpha.com',
        seen: false,
      },
    ]);
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/notifications/wn-1/read`, {
      method: 'PATCH',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('watcher_notifications').select('*');
    expect((data as any[])[0].seen).toBe(true);
  });
});

describe('Self-registration removal', () => {
  it('does not expose a public registration endpoint (admin-only provisioning)', async () => {
    await supabase.from('app_config').upsert({ key: 'businessUnits', value: ['ALPHA', 'BETA'] }, { onConflict: 'key' });
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Payment Partner', email: 'new.partner@alpha.com', role: 'SUPER_ADMIN', bu: 'ALPHA', password: 'password123' }),
    });
    expect(res.status).toBe(404);
  });

  it('does not create a user row via public registration for any business unit', async () => {
    await supabase.from('app_config').upsert({ key: 'businessUnits', value: ['ALPHA'] }, { onConflict: 'key' });
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sneaky', email: 'sneaky@x.com', role: 'PARTNER', bu: 'BETA', password: 'password123' }),
    });
    expect(res.status).toBe(404);
    const { data } = await supabase.from('users').select('*').eq('email', 'sneaky@x.com');
    expect((data as any[]).length).toBe(0);
  });
});