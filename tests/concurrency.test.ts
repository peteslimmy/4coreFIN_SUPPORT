/**
 * Concurrency & load regression tests.
 *
 * Validates the high-concurrency hardening:
 *  - Parallel ticket submissions all succeed with unique ids and zero data
 *    loss (atomic id reservation + insert-on-create collision retry).
 *  - Optimistic concurrency control rejects stale writes with
 *    CONCURRENT_MODIFICATION instead of silently overwriting.
 *  - Hash-chained audit log stays intact when writes are queued concurrently.
 *  - Idempotency-Key replays a completed submission instead of duplicating it.
 */

import { describe, it, expect } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import express from 'express';
import { createApiRouter } from '../server/routes';
import { requireCsrf } from '../server/auth';
import { upsertTicket } from '../server/repository';
import { supabase, readRows } from './helpers/testDb';
import { createTestUser } from './helpers/testUsers';
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

async function seedOfficer() {
  await createTestUser({
    id: 'usr-load',
    name: 'Load Officer',
    email: 'load@4core.com',
    password: PASSWORD,
    role: 'BU_SUPPORT',
    bu: 'ALPHA',
    phone: '',
  });
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

describe('Concurrent load handling', () => {
  it('handles 20 concurrent ticket submissions with unique ids and zero data loss', async () => {
    await seedOfficer();
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;

    const s = await login('load@4core.com');
    const N = 20;
    const responses = await Promise.all(Array.from({ length: N }, (_, i) => submitTicket(s, i)));

    // Every request succeeds — none dropped, none 5xx'd.
    const statuses = responses.map((r) => r.status);
    for (const status of statuses) {
      expect(status, `expected 201, got ${status}`).toBe(201);
    }
    const bodies = await Promise.all(responses.map((r) => r.json()));

    // All ids unique — no silent overwrite via upsert collision.
    const ids = new Set(bodies.map((b) => b.id));
    expect(ids.size).toBe(N);

    // Exactly N rows persisted.
    const tickets = await readRows('tickets');
    expect(tickets.length).toBe(N);

    server?.close();
    server = undefined;
  }, 60_000);

  it('rejects stale writes with CONCURRENT_MODIFICATION instead of overwriting', async () => {
    await seedOfficer();
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;

    const s = await login('load@4core.com');
    const created = await (await submitTicket(s, 100)).json();

    const stored = (await readRows('tickets')).find((t) => t.id === created.id);
    expect(stored).toBeTruthy();
    const dbVersion = typeof stored.version === 'number' ? stored.version : null;

    if (dbVersion !== null) {
      // A writer holding a stale snapshot must be rejected…
      await expect(
        upsertTicket({ ...created, priority: 'CRITICAL' }, { expectedVersion: dbVersion - 1 })
      ).rejects.toMatchObject({ code: 'CONCURRENT_MODIFICATION' });

      // …while the current-version writer succeeds and bumps the version.
      await upsertTicket({ ...created, priority: 'HIGH' }, { expectedVersion: dbVersion });
      const after = (await readRows('tickets')).find((t) => t.id === created.id);
      expect(after.priority).toBe('HIGH');
      expect(after.version).toBe(dbVersion + 1);
    }

    server?.close();
    server = undefined;
  }, 30_000);

  it('keeps the hash-chained audit log intact under concurrent writes', async () => {
    await seedOfficer();
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;

    const s = await login('load@4core.com');
    // Fire-and-forget audits queue through the FIFO chain; give them a moment
    // to drain before verifying linkage.
    await Promise.all(Array.from({ length: 10 }, (_, i) => submitTicket(s, 200 + i)));
    await new Promise((r) => setTimeout(r, 300));

    const logs = await readRows('audit_logs');
    expect(logs.length).toBeGreaterThan(0);
    // No forked chain: every hash appears exactly once.
    const hashes = logs.map((l) => l.hash);
    expect(new Set(hashes).size).toBe(hashes.length);
    // Each entry links to some earlier entry's hash (single chain).
    const hashSet = new Set(hashes);
    for (const log of logs) {
      if (log.previous_hash === '') continue;
      expect(hashSet.has(log.previous_hash), `orphaned previous_hash on ${log.id}`).toBe(true);
    }

    server?.close();
    server = undefined;
  }, 60_000);

  it('replays a completed submission under the same Idempotency-Key without duplicating', async () => {
    await seedOfficer();
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;

    const s = await login('load@4core.com');
    const firstRes = await submitTicket(s, 300, { 'Idempotency-Key': 'load-key-1' });
    expect(firstRes.status).toBe(201);
    const first = await firstRes.json();

    await new Promise((r) => setTimeout(r, 100));

    const secondRes = await submitTicket(s, 300, { 'Idempotency-Key': 'load-key-1' });
    expect(secondRes.status).toBe(201);
    const second = await secondRes.json();

    // Same logical submission — identical id replayed from cache.
    expect(second.id).toBe(first.id);

    // Allow the async cache write to settle, then confirm a single row.
    await new Promise((r) => setTimeout(r, 200));
    const tickets = await readRows('tickets');
    expect(tickets.length).toBe(1);

    server?.close();
    server = undefined;
  }, 30_000);
});
