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
import { idempotencyMiddleware } from '../../server/middleware/idempotency';
import { createFakeSupabase, type TableStore } from '@/tests/helpers/fakeSupabase';

async function readTable(table: string): Promise<any[]> {
  const { data } = await supabase.from(table).select('*');
  return (data as any[]) ?? [];
}

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

function seedStore(): TableStore {
  const pass = hashPassword(PASSWORD);
  return {
    users: [
      { id: 'usr-admin', name: 'Admin', email: 'admin@4core.com', password_hash: pass, role: 'SUPER_ADMIN', bu: 'ALL', phone: '', tenant_id: ALPHA },
    ],
    tickets: [], comments: [], evidence: [], audit_logs: [], watcher_notifications: [],
    major_incidents: [], customers: [], sla_rules: [], holidays: [],
    ticket_templates: [], kb_articles: [], tenants: [], partner_organizations: [],
    app_config: [
      { key: 'businessUnits', value: [{ name: 'ALPHA', code: 'ALP' }] },
    ],
    idempotency_keys: [],
    ticket_id_counters: [] as any,
  };
}

/**
 * Extend the fake client with the migration-072 RPC so the production
 * code path (atomic per-(BU,date) counter) is exercised. The fake store is
 * mutated synchronously inside the single-threaded event loop, which models
 * Postgres row-lock semantics for ON CONFLICT DO UPDATE well enough to prove
 * sequence uniqueness under interleaved async requests.
 */
function withAtomicCounterRpc(fake: ReturnType<typeof createFakeSupabase>, store: TableStore) {
  return Object.assign(fake, {
    rpc: (fn: string, params: any) => {
      if (fn === 'next_ticket_id_sequence') {
        const buCode = String(params?.p_bu_code ?? '');
        const dateKey = String(params?.p_date_key ?? '');
        const table = (store['ticket_id_counters'] ||= []);
        let row = table.find((r: any) => r.bu_code === buCode && r.date_key === dateKey);
        if (!row) {
          row = { bu_code: buCode, date_key: dateKey, seq: 0 };
          table.push(row);
        }
        row.seq += 1;
        return Promise.resolve({ data: row.seq, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown function ${fn}` } });
    },
  });
}

let base: string;
let server: Server | undefined;
let store: TableStore;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', (req, res, next) => requireCsrf(req as any, res, next));
// Mirrors server.ts middleware order: csrf → idempotency → routes.
app.use('/api', idempotencyMiddleware);
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

function submitTicket(s: Session, n: number, extraHeaders: Record<string, string> = {}) {
  return fetch(`${base}/tickets`, {
    method: 'POST',
    headers: { ...authedHeaders(s), 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({
      customerName: `Customer ${n}`,
      customerEmail: `cust${n}@example.com`,
      businessUnit: 'ALPHA',
      category: 'Payment Dispute',
      priority: 'MEDIUM',
      description: `Concurrent load test ticket ${n}`,
    }),
  });
}

beforeEach(async () => {
  store = seedStore();
  Object.assign(supabase, withAtomicCounterRpc(createFakeSupabase(store), store));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(() => { server?.close(); });

describe('Concurrent load handling (fake Supabase)', () => {
  let adminSession: Session;
  beforeEach(async () => { adminSession = await login('admin@4core.com'); });

  it('handles 25 concurrent ticket submissions with unique BU-prefixed ids and zero loss', async () => {
    const N = 25;
    const responses = await Promise.all(Array.from({ length: N }, (_, i) => submitTicket(adminSession, i)));
    for (const r of responses) {
      expect(r.status, 'every concurrent submission must succeed').toBe(201);
    }
    const bodies = await Promise.all((responses as any[]).map((r) => r.json()));

    const ids = new Set<string>(bodies.map((b: any) => b.id));
    expect(ids.size).toBe(N);

    // All ids share today's BU prefix and form an unbroken sequence 1..N.
    const nums = [...ids].map((id) => parseInt(id.split('-')[2], 10)).sort((a, b) => a - b);
    expect(nums[0]).toBe(1);
    expect(nums[N - 1]).toBe(N);

    const tickets = await readTable('tickets');
    expect(tickets.length).toBe(N);

    // The atomic counter advanced exactly N times.
    expect(store.ticket_id_counters).toHaveLength(1);
    expect(store.ticket_id_counters[0].seq).toBe(N);
  });

  it('rejects stale optimistic-concurrency writes with CONCURRENT_MODIFICATION', async () => {
    const created = await (await submitTicket(adminSession, 500)).json();
    const stored = (await readTable('tickets')).find((t) => t.id === created.id)!;
    const dbVersion = typeof stored.version === 'number' ? stored.version : 1;
    expect(dbVersion).toBeGreaterThanOrEqual(1);

    const { upsertTicket } = await import('../../server/repository');

    // First writer wins: current-version write succeeds and bumps the version.
    await upsertTicket({ ...created, priority: 'HIGH' }, { expectedVersion: dbVersion });
    let after = (await readTable('tickets')).find((t) => t.id === created.id)!;
    expect(after.priority).toBe('HIGH');
    expect(after.version).toBe(dbVersion + 1);

    // A writer holding the pre-update snapshot is rejected instead of
    // silently overwriting the first writer's change.
    await expect(
      upsertTicket({ ...created, priority: 'CRITICAL' }, { expectedVersion: dbVersion })
    ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });

    // The next current-version writer proceeds.
    await upsertTicket({ ...created, priority: 'LOW' }, { expectedVersion: dbVersion + 1 });
    after = (await readTable('tickets')).find((t) => t.id === created.id)!;
    expect(after.priority).toBe('LOW');
    expect(after.version).toBe(dbVersion + 2);
  });

  it('keeps the hash-chained audit log intact when writes queue concurrently', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => submitTicket(adminSession, 600 + i)));
    // Fire-and-forget audits drain through the FIFO chain; flush microtasks.
    await new Promise((r) => setTimeout(r, 50));

    const logs = await readTable('audit_logs');
    expect(logs.length).toBeGreaterThan(0);

    const hashes = logs.map((l) => l.hash);
    expect(new Set(hashes).size).toBe(hashes.length); // no forked/duplicated hash

    const hashSet = new Set(hashes);
    for (const log of logs) {
      if (log.previous_hash === '') continue;
      expect(hashSet.has(log.previous_hash), `orphaned previous_hash on ${log.id}`).toBe(true);
    }
  });

  it('replays a completed submission under the same Idempotency-Key without duplicating', async () => {
    const firstRes = await submitTicket(adminSession, 700, { 'Idempotency-Key': 'load-key-1' });
    expect(firstRes.status).toBe(201);
    const first = await firstRes.json();

    await new Promise((r) => setTimeout(r, 20));

    const secondRes = await submitTicket(adminSession, 700, { 'Idempotency-Key': 'load-key-1' });
    expect(secondRes.status).toBe(201);
    const second = await secondRes.json();

    expect(second.id).toBe(first.id);
    expect(await readTable('tickets')).toHaveLength(1);
  });
});
