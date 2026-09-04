import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';

/**
 * Security regression tests for the idempotency middleware (audit finding
 * API-05). These run against an in-memory Supabase stub so they execute in
 * every environment (no dedicated test project required), unlike
 * tests/idempotency.test.ts which is a live-DB integration suite.
 */

// In-memory table backing the middleware.
const rows: Array<Record<string, unknown>> = [];

vi.mock('../../server/supabase', () => {
  function from(_table: string) {
    const filters: Array<[string, unknown]> = [];
    const builder: any = {
      select: () => builder,
      insert: (row: Record<string, unknown>) => {
        const dup = rows.find((r) => r.key === row.key);
        if (dup) {
          return Promise.resolve({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          });
        }
        rows.push({ ...row, created_at: new Date().toISOString() });
        return Promise.resolve({ data: null, error: null });
      },
      upsert: (row: Record<string, unknown>) => {
        const dup = rows.find((r) => r.key === row.key);
        if (dup) Object.assign(dup, row);
        else rows.push({ ...row, created_at: new Date().toISOString() });
        return Promise.resolve({ data: null, error: null });
      },
      delete: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return builder;
      },
      lt: () => builder,
      maybeSingle: () => {
        const [first] = filters;
        const row = first ? rows.find((r) => r[first[0]] === first[1]) : rows[0];
        return Promise.resolve({ data: row ?? null, error: null });
      },
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(onFulfilled),
    };
    return builder;
  }
  return { supabase: { from } };
});

const { idempotencyMiddleware } = await import('../../server/middleware/idempotency');

function makeApp(handler: (req: express.Request, res: express.Response) => void) {
  const app = express();
  app.use(express.json());
  app.use(idempotencyMiddleware);
  app.post('/api/thing', handler);
  app.patch('/api/thing', handler);
  return app;
}

async function listen(app: express.Express): Promise<string> {
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

let hits = 0;

beforeEach(() => {
  rows.length = 0;
  hits = 0;
});

describe('idempotency middleware — security scoping (API-05)', () => {
  it('replays the cached response for the same session and body', async () => {
    const app = makeApp((_req, res) => {
      hits += 1;
      res.status(201).json({ hit: hits });
    });
    const base = await listen(app);
    const headers = {
      'Idempotency-Key': 'k1',
      'Content-Type': 'application/json',
      Cookie: '4c_session=tokenA',
    };
    const first = await fetch(`${base}/api/thing`, { method: 'POST', headers, body: '{"a":1}' });
    const second = await fetch(`${base}/api/thing`, { method: 'POST', headers, body: '{"a":1}' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await second.json()).hit).toBe(1);
    expect(hits).toBe(1);
  });

  it("never replays user A's cached response for user B (cross-account replay)", async () => {
    const app = makeApp((_req, res) => {
      hits += 1;
      res.status(201).json({ hit: hits });
    });
    const base = await listen(app);
    const body = '{"a":1}';
    const a = await fetch(`${base}/api/thing`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'shared-key', 'Content-Type': 'application/json', Cookie: '4c_session=tokenA' },
      body,
    });
    expect((await a.json()).hit).toBe(1);

    const b = await fetch(`${base}/api/thing`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'shared-key', 'Content-Type': 'application/json', Cookie: '4c_session=tokenB' },
      body,
    });
    expect(b.status).toBe(201);
    expect((await b.json()).hit).toBe(2); // user B executed the handler themselves
    expect(hits).toBe(2);
  });

  it('covers PATCH, not just POST/PUT', async () => {
    const app = makeApp((_req, res) => {
      hits += 1;
      res.status(200).json({ hit: hits });
    });
    const base = await listen(app);
    const headers = {
      'Idempotency-Key': 'patch-key',
      'Content-Type': 'application/json',
      Cookie: '4c_session=tokenA',
    };
    const first = await fetch(`${base}/api/thing`, { method: 'PATCH', headers, body: '{"x":1}' });
    const second = await fetch(`${base}/api/thing`, { method: 'PATCH', headers, body: '{"x":1}' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await second.json()).hit).toBe(1);
    expect(hits).toBe(1);
  });

  it('namespaces stored keys per session so rows cannot collide across users', async () => {
    const app = makeApp((_req, res) => res.status(201).json({}));
    const base = await listen(app);
    await fetch(`${base}/api/thing`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'k', 'Content-Type': 'application/json', Cookie: '4c_session=t1' },
      body: '{}',
    });
    await fetch(`${base}/api/thing`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'k', 'Content-Type': 'application/json', Cookie: '4c_session=t2' },
      body: '{}',
    });
    const keys = rows.map((r) => String(r.key));
    expect(keys.length).toBe(2);
    expect(new Set(keys).size).toBe(2);
    expect(keys.every((k) => k.startsWith('sess-'))).toBe(true);
  });

  it('anonymous callers share one scope (back-compat for pre-auth endpoints)', async () => {
    const app = makeApp((_req, res) => {
      hits += 1;
      res.status(201).json({ hit: hits });
    });
    const base = await listen(app);
    const headers = { 'Idempotency-Key': 'anon-key', 'Content-Type': 'application/json' };
    await fetch(`${base}/api/thing`, { method: 'POST', headers, body: '{}' });
    const replay = await fetch(`${base}/api/thing`, { method: 'POST', headers, body: '{}' });
    expect((await replay.json()).hit).toBe(1);
    expect(rows[0].key).toBe('anon:anon-key');
  });
});

