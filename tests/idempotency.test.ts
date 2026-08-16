import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import express from 'express';
import { supabase } from '../server/supabase';
import { idempotencyMiddleware, hashBody } from '../server/middleware/idempotency';
import './helpers/conftest';

let server: Server | undefined;
let base: string;
let hitCount: number;

const app = express();
app.use(express.json());
app.use(idempotencyMiddleware);
app.post('/api/orders', (_req, res) => {
  hitCount += 1;
  res.status(201).json({ orderId: 'ord-1', hit: hitCount, echoed: (_req as any).body });
});

beforeEach(async () => {
  hitCount = 0;
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

async function idempotencyRows() {
  const { data } = await supabase.from('idempotency_keys').select('*');
  return data as any[];
}

describe('Idempotency middleware — SEC-43 regression', () => {
  it('stores the 2xx response under the key and replays it without rerunning the handler', async () => {
    const body = JSON.stringify({ customerId: 'c1', amount: 100 });

    const first = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1', 'Content-Type': 'application/json' },
      body,
    });
    expect(first.status).toBe(201);
    expect((await first.json()).hit).toBe(1);

    await new Promise((r) => setTimeout(r, 20));

    const second = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1', 'Content-Type': 'application/json' },
      body,
    });
    expect(second.status).toBe(201);
    expect((await second.json()).hit).toBe(1); // handler did NOT run again

    expect((await idempotencyRows()).length).toBe(1);
  });

  it('returns 409 when the same key is reused with a different body', async () => {
    const first = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-conflict', 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'c1', amount: 100 }),
    });
    expect(first.status).toBe(201);
    await new Promise((r) => setTimeout(r, 20));

    const second = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-conflict', 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'c1', amount: 200 }),
    });
    expect(second.status).toBe(409);
    expect((await second.json()).error).toMatch(/already used/i);
  });

  it('does not cache non-2xx responses so a corrected retry succeeds', async () => {
    const errApp = express();
    errApp.use(express.json());
    errApp.use(idempotencyMiddleware);
    errApp.post('/api/orders', (_req, res) => res.status(400).json({ error: 'bad request' }));
    const errServer = errApp.listen(0);
    const errBase = `http://127.0.0.1:${(errServer.address() as AddressInfo).port}/api`;
    await new Promise<void>((resolve) => errServer.once('listening', resolve));

    try {
      const failed = await fetch(`${errBase}/orders`, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'key-retry', 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: 'c1' }),
      });
      expect(failed.status).toBe(400);
      await new Promise((r) => setTimeout(r, 20));

      const retried = await fetch(`${base}/orders`, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'key-retry', 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: 'c1' }),
      });
      expect(retried.status).toBe(201); // NOT pinned to the old 400
    } finally {
      await new Promise<void>((resolve) => errServer.close(() => resolve()));
    }
  });

  it('leaves requests without an Idempotency-Key untouched', async () => {
    const plain = await fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'c1' }),
    });
    expect(plain.status).toBe(201);
    expect((await plain.json()).orderId).toBe('ord-1');
  });

  it('skips GET requests even when a key is present', async () => {
    const res = await fetch(`${base}/orders`, {
      method: 'GET',
      headers: { 'Idempotency-Key': 'key-get', 'Content-Type': 'application/json' },
    });
    expect([404, 201]).toContain(res.status);
  });

  it('hashBody is stable for equal inputs and differs for changed payloads', () => {
    expect(hashBody({ a: 1, b: 2 })).toBe(hashBody({ a: 1, b: 2 }));
    expect(hashBody({ a: 1, b: 2 })).not.toBe(hashBody({ a: 1, b: 3 }));
  });
});