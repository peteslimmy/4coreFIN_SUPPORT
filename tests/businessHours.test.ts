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
      { id: 'usr-a', name: 'Alice', email: 'alice@alpha.com', password_hash: pass, role: 'BU_SUPPORT', bu: 'ALPHA', phone: '', tenant_id: ALPHA },
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
    business_hours: [],
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

describe('Business Hours API', () => {
  it('returns an empty array when no business hours are configured', async () => {
    const s = await login('admin@4core.com');
    const res = await fetch(`${base}/business-hours?tenantId=${ALPHA}`, {
      headers: authedHeaders(s, false),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('allows a SUPER_ADMIN to set business hours', async () => {
    const s = await login('admin@4core.com');
    const payload = {
      tenantId: ALPHA,
      tzName: 'America/New_York',
      days: [
        { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true },
        { dayOfWeek: 2, openTime: '09:00', closeTime: '17:00', isActive: true },
        { dayOfWeek: 3, openTime: '09:00', closeTime: '17:00', isActive: true },
        { dayOfWeek: 4, openTime: '09:00', closeTime: '17:00', isActive: true },
        { dayOfWeek: 5, openTime: '09:00', closeTime: '17:00', isActive: true },
      ],
    };
    const res = await fetch(`${base}/business-hours`, {
      method: 'PUT',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const first = rows.find((r: any) => r.day_of_week === 1) ?? rows[0];
    expect(first).toMatchObject({ tenant_id: ALPHA, tz_name: 'America/New_York', open_time_local: '09:00', close_time_local: '17:00' });
  });

  it('replaces existing rows on subsequent PUT (idempotent upsert)', async () => {
    const s = await login('admin@4core.com');
    const payload = {
      tenantId: ALPHA,
      tzName: 'UTC',
      days: [{ dayOfWeek: 1, openTime: '08:00', closeTime: '16:00', isActive: true }],
    };
    await fetch(`${base}/business-hours`, {
      method: 'PUT',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res2 = await fetch(`${base}/business-hours?tenantId=${ALPHA}`, {
      headers: authedHeaders(s, false),
    });
    const body2 = await res2.json();
    expect(body2.length).toBe(1);
    expect(body2[0].open_time_local).toBe('08:00');
  });

  it('rejects unauthorized roles', async () => {
    const s = await login('alice@alpha.com');
    const res = await fetch(`${base}/business-hours`, {
      method: 'PUT',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: ALPHA, tzName: 'UTC', days: [] }),
    });
    expect(res.status).toBe(403);
  });
});