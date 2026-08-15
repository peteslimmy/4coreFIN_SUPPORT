import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

vi.mock('../server/supabase', () => {
  const s = { from: () => { throw new Error('not initialised'); } };
  return { supabase: s, supabaseAuth: s };
});

import express from 'express';
import { supabase } from '../server/supabase';
import { createApiRouter } from '../server/routes';
import { requireCsrf, hashPassword } from '../server/auth';
import { createReferenceRouter } from '../server/routes/reference';
import { createFakeSupabase, type TableStore } from './helpers/fakeSupabase';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

function seedStore(): TableStore {
  const pass = hashPassword(PASSWORD);
  return {
    users: [
      { id: 'usr-a', name: 'Alice Alpha', email: 'alice@alpha.com', password_hash: pass, role: 'BU_SUPPORT', bu: 'ALPHA', phone: '', tenant_id: ALPHA },
      { id: 'usr-admin', name: 'Admin', email: 'admin@4core.com', password_hash: pass, role: 'SUPER_ADMIN', bu: 'ALL', phone: '', tenant_id: ALPHA },
      { id: 'usr-prov', name: 'Rep', email: 'rep@provider.com', password_hash: pass, role: 'PARTNER', partner: 'Paystack', phone: '', tenant_id: ALPHA },
    ],
    tickets: [
      { id: 'tkt-a1', business_unit: 'ALPHA', tenant_id: ALPHA, partner: 'Paystack', category: 'Payment Dispute', issue_type: 'Payment Dispute', priority: 'HIGH', status: 'INVESTIGATE', is_deleted: false, created_at: '2026-07-01T00:00:00Z', sla_deadline: '2026-07-10T00:00:00Z', customer_name: 'Faith', customer_email: 'faith@example.com', customer_phone: '', customer_last_name: '', customer_id: null, amount: 100, transaction_id: 'TX1', card_pan: '****', description: '', bank_name: '', is_escalated: false, escalation_count: 0, assigned_agent_id: '', major_incident_id: null, feedback_score: null, feedback_comment: null, root_cause: null, corrective_action: null, submitted_by: 'BU_SUPPORT', submitted_by_name: '', submitted_by_phone: '', watchers: [], rca_details: null, custom_fields: {}, duplicate_of: null },
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
app.use(express.json({ limit: '5mb', strict: false }));
app.use('/api', (req, res, next) => requireCsrf(req as any, res, next));
app.use('/api', createApiRouter());
app.use('/api/reference', createReferenceRouter());

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

describe('Reference data — access control', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await fetch(`${base}/reference/businessUnits`);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin (PARTNER lacks admin:config)', async () => {
    const s = await login('rep@provider.com');
    const res = await fetch(`${base}/reference/businessUnits`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(403);
  });
});

describe('Reference data — config-key CRUD (businessUnits)', () => {
  const seedBus = () => {
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      app_config: [{ key: 'businessUnits', value: [{ name: 'ALPHA', code: 'ALPH' }, { name: 'BETA', code: 'BETA' }] }],
    }));
  };

  it('lists config items', async () => {
    seedBus();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/businessUnits`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ name: 'ALPHA', code: 'ALPH' }, { name: 'BETA', code: 'BETA' }]);
  });

  it('creates an item (uppercased) and persists it', async () => {
    seedBus();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/businessUnits`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'retail-b', code: 'retb' }),
    });
    expect(res.status).toBe(201);
    const { data } = await supabase.from('app_config').select('value').eq('key', 'businessUnits').single();
    expect(data.value).toEqual([{ name: 'ALPHA', code: 'ALPH' }, { name: 'BETA', code: 'BETA' }, { name: 'RETAIL-B', code: 'RETB' }]);
  });

  it('rejects duplicate', async () => {
    seedBus();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/businessUnits`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ALPHA-COPY', code: 'ALPH' }),
    });
    expect(res.status).toBe(409);
  });

  it('updates an item', async () => {
    seedBus();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/businessUnits/ALPHA`, {
      method: 'PATCH',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ALPHA-NORTH', code: 'ALPN' }),
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('app_config').select('value').eq('key', 'businessUnits').single();
    expect(data.value).toEqual([{ name: 'ALPHA-NORTH', code: 'ALPN' }, { name: 'BETA', code: 'BETA' }]);
  });

  it('deletes an unreferenced item', async () => {
    seedBus();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/businessUnits/BETA`, {
      method: 'DELETE',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('app_config').select('value').eq('key', 'businessUnits').single();
    expect(data.value).toEqual([{ name: 'ALPHA', code: 'ALPH' }]);
  });

  it('blocks deleting a business unit that has tickets (409)', async () => {
    // Only tickets reference ALPHA — users reference BETA
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      app_config: [{ key: 'businessUnits', value: [{ name: 'ALPHA', code: 'ALPH' }] }],
      users: (seedStore().users as any[]).map((u) => ({ ...u, bu: 'BETA' })),
    }));
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/businessUnits/ALPHA`, {
      method: 'DELETE',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.referencedBy).toEqual({ tickets: 1 });
  });

  it('blocks deleting a business unit that has users (409)', async () => {
    // Only users reference ALPHA — tickets reference BETA
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      app_config: [{ key: 'businessUnits', value: [{ name: 'ALPHA', code: 'ALPH' }] }],
      tickets: (seedStore().tickets as any[]).map((t) => ({ ...t, business_unit: 'BETA', tenant_id: ALPHA })),
    }));
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/businessUnits/ALPHA`, {
      method: 'DELETE',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.referencedBy).toEqual({ users: 1 });
  });
});

describe('Reference data — object config CRUD (categories)', () => {
  const seedCats = () => {
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      app_config: [{ key: 'categories', value: [{ name: 'Payment Dispute', description: 'a' }] }],
    }));
  };

  it('lists object items', async () => {
    seedCats();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/categories`, { headers: authedHeaders(s, false) });
    expect(await res.json()).toEqual([{ name: 'Payment Dispute', description: 'a' }]);
  });

  it('creates an object item with a generated id', async () => {
    seedCats();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/categories`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Technical Issue', description: 'b' }),
    });
    expect(res.status).toBe(201);
    const { data } = await supabase.from('app_config').select('value').eq('key', 'categories').single();
    const arr = data.value as any[];
    expect(arr.some((c) => c.name === 'Technical Issue')).toBe(true);
  });

  it('blocks deleting a referenced category', async () => {
    seedCats();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/categories/Payment%20Dispute`, {
      method: 'DELETE',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(409);
  });
});

describe('Reference data — table CRUD (sla_rules)', () => {
  const seedSla = () => {
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      app_config: [{ key: 'categories', value: [{ id: 'cat-1', name: 'Duplicate Debit', description: 'a' }, { id: 'cat-2', name: 'Refund', description: 'b' }] }],
      sla_rules: [{ id: 'sla-1', category: 'Duplicate Debit', priority: 'HIGH', duration_hours: 24 }],
    }));
  };

  it('lists table items using the row mapper (camelCase)', async () => {
    seedSla();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/sla_rules`, { headers: authedHeaders(s, false) });
    expect(await res.json()).toEqual([{ id: 'sla-1', category: 'Duplicate Debit', priority: 'HIGH', durationHours: 24 }]);
  });

  it('creates a table row', async () => {
    seedSla();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/sla_rules`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'sla-2', category: 'Refund', priority: 'LOW', durationHours: 12 }),
    });
    expect(res.status).toBe(201);
    const { data } = await supabase.from('sla_rules').select('*');
    expect((data as any[]).length).toBe(2);
  });

  it('updates a table row', async () => {
    seedSla();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/sla_rules/sla-1`, {
      method: 'PATCH',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationHours: 12 }),
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('sla_rules').select('*');
    expect((data as any[])[0].duration_hours).toBe(12);
  });

  it('rejects invalid payloads with 400', async () => {
    seedSla();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/sla_rules`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: '', priority: 'HIGH', durationHours: -1 }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an SLA rule whose category does not exist', async () => {
    seedSla();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/sla_rules`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'No Such Category', priority: 'LOW', durationHours: 12 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain('Category must exist');
  });

  it('blocks deleting an SLA rule referenced by active tickets', async () => {
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      tickets: [
        { id: 'tkt-sla', business_unit: 'ALPHA', tenant_id: ALPHA, partner: 'Paystack', category: 'Duplicate Debit', issue_type: 'Duplicate Debit', priority: 'HIGH', status: 'INVESTIGATE', is_deleted: false, created_at: '2026-07-01T00:00:00Z', sla_deadline: '2026-07-10T00:00:00Z', customer_name: 'Faith', customer_email: 'faith@example.com', customer_phone: '', customer_last_name: '', customer_id: null, amount: 100, transaction_id: 'TX1', card_pan: '****', description: '', bank_name: '', is_escalated: false, escalation_count: 0, assigned_agent_id: '', major_incident_id: null, feedback_score: null, feedback_comment: null, root_cause: null, corrective_action: null, submitted_by: 'BU_SUPPORT', submitted_by_name: '', submitted_by_phone: '', watchers: [], rca_details: null, custom_fields: {}, duplicate_of: null },
      ],
      app_config: [{ key: 'categories', value: [{ id: 'cat-1', name: 'Duplicate Debit', description: 'a' }, { id: 'cat-2', name: 'Refund', description: 'b' }] }],
      sla_rules: [{ id: 'sla-1', category: 'Duplicate Debit', priority: 'HIGH', duration_hours: 24 }],
    }));
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/sla_rules/sla-1`, {
      method: 'DELETE',
      headers: { ...authedHeaders(s) },
    });
    expect(res.status).toBe(409);
    const { data } = await supabase.from('sla_rules').select('*');
    expect((data as any[]).length).toBe(1);
  });

  it('allows deleting an SLA rule with no active matching tickets', async () => {
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      tickets: [],
      app_config: [{ key: 'categories', value: [{ id: 'cat-1', name: 'Duplicate Debit', description: 'a' }] }],
      sla_rules: [{ id: 'sla-1', category: 'Duplicate Debit', priority: 'HIGH', duration_hours: 24 }],
    }));
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/sla_rules/sla-1`, {
      method: 'DELETE',
      headers: { ...authedHeaders(s) },
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('sla_rules').select('*');
    expect((data as any[]).length).toBe(0);
  });

  it('accepts camelCase UI kind labels (slaRules → sla_rules)', async () => {
    seedSla();
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/slaRules`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'sla-1', category: 'Duplicate Debit', priority: 'HIGH', durationHours: 24 }]);
  });
});

describe('Reference data — unknown kind & audits', () => {
  it('404 for unknown kind', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/nope`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(404);
  });

  it('writes a config create to the audit ledger', async () => {
    const s = await login('admin@4core.com');
    await fetch(`${base}/reference/partners`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify('Stripe'),
    });
    const { data } = await supabase.from('audit_logs').select('*');
    const actions = (data as any[]).map((a) => a.action);
    expect(actions).toContain('REFERENCE_PARTNERS_CREATED');
  });
});

describe('Reference data — custom kinds', () => {
  it('rejects unauthenticated /kinds', async () => {
    const res = await fetch(`${base}/reference/kinds`);
    expect(res.status).toBe(401);
  });

  it('lists custom kinds (empty by default)', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/kinds`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('creates a custom kind and seeds its items', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/kinds`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'paymentProviders', label: 'Payment Provider', labelPlural: 'Payment Providers', description: 'd', items: ['Paystack', 'Flutterwave'] }),
    });
    expect(res.status).toBe(201);

    const kindsRes = await fetch(`${base}/reference/kinds`, { headers: authedHeaders(s, false) });
    expect(await kindsRes.json()).toEqual([
      { kind: 'paymentProviders', label: 'Payment Provider', labelPlural: 'Payment Providers', description: 'd', stringItems: true },
    ]);

    const itemsRes = await fetch(`${base}/reference/paymentProviders`, { headers: authedHeaders(s, false) });
    expect(await itemsRes.json()).toEqual(['Paystack', 'Flutterwave']);
  });

  it('adds items to an existing custom kind through normal CRUD', async () => {
    const s = await login('admin@4core.com');
    await fetch(`${base}/reference/kinds`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'paymentProviders', label: 'Payment Provider' }),
    });
    const create = await fetch(`${base}/reference/paymentProviders`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify('Paga'),
    });
    expect(create.status).toBe(201);
    const itemsRes = await fetch(`${base}/reference/paymentProviders`, { headers: authedHeaders(s, false) });
    expect(await itemsRes.json()).toEqual(['Paga']);
  });

  it('rejects a duplicate custom kind with 409', async () => {
    const s = await login('admin@4core.com');
    const body = { kind: 'paymentProviders', label: 'Payment Provider' };
    await fetch(`${base}/reference/kinds`, { method: 'POST', headers: { ...authedHeaders(s), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const res = await fetch(`${base}/reference/kinds`, { method: 'POST', headers: { ...authedHeaders(s), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(res.status).toBe(409);
  });

  it('rejects a built-in kind name with 409', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/kinds`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'partners', label: 'Partners' }),
    });
    expect(res.status).toBe(409);
  });

  it('rejects a kind key with spaces with 400', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/kinds`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'payment provider', label: 'Payment Provider' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-admin from creating kinds (403)', async () => {
    const s = await login('rep@provider.com');
    const res = await fetch(`${base}/reference/kinds`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'x', label: 'X' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('Reference data — users kind', () => {
  it('rejects a user that has admin:config but not admin:users (BU_SUPPORT)', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/reference/users`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(403);
  });

  it('lists users as public rows', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/users`, { headers: authedHeaders(s, false) });
    expect(res.status).toBe(200);
    const users = await res.json();
    expect(Array.isArray(users)).toBe(true);
    expect(users.some((u: any) => u.email === 'alice@alpha.com')).toBe(true);
  });

  it('creates a user (hashed password) and persists it', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/users`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Carol', email: 'carol@alpha.com', role: 'PARTNER', partner: 'Paystack', password: 'secret123' }),
    });
    expect(res.status).toBe(201);
    const { data } = await supabase.from('users').select('*').eq('email', 'carol@alpha.com').single();
    expect(data.name).toBe('Carol');
    expect(data.password_hash).not.toBe('secret123');
    expect(data.password_hash.startsWith('$2')).toBe(true);
    expect(data.auth_user_id).toBe('auth-carol@alpha.com');
    expect(data.must_change_password).toBe(true);
  });

  it('rejects a user with a short password', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/users`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dave', email: 'dave@alpha.com', role: 'PARTNER', partner: 'Paystack', password: 'short' }),
    });
    expect(res.status).toBe(400);
  });

  it('updates a user without touching the password when omitted', async () => {
    const s = await login('admin@4core.com');
    const { data: before } = await supabase.from('users').select('*').eq('id', 'usr-prov').single();
    const res = await fetch(`${base}/reference/users/usr-prov`, {
      method: 'PATCH',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '08000000000' }),
    });
    expect(res.status).toBe(200);
    const { data: after } = await supabase.from('users').select('*').eq('id', 'usr-prov').single();
    expect(after.phone).toBe('08000000000');
    expect(after.password_hash).toBe(before.password_hash);
  });

  it('rejects BU_SUPPORT (admin:config) from creating users', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/reference/users`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Eve', email: 'eve@alpha.com', role: 'PARTNER', partner: 'Paystack', password: 'secret123' }),
    });
    expect(res.status).toBe(403);
  });

  it('allows SUPER_ADMIN to delete a user', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/reference/users/usr-prov`, {
      method: 'DELETE',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('users').select('*').eq('id', 'usr-prov');
    expect((data as any[]).length).toBe(0);
  });

  it('blocks BU_SUPPORT from deleting a user even with admin:config', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/reference/users/usr-prov`, {
      method: 'DELETE',
      headers: authedHeaders(s),
    });
    expect(res.status).toBe(403);
  });
});