import { describe, it, expect } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import express from 'express';
import { createUploadGate, rejectOversize } from '../../server/middleware/uploadGate';

function listen(app: express.Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0);
    server.once('listening', () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

describe('uploadGate', () => {
  it('bounds concurrent processing and queues the overflow', async () => {
    let active = 0;
    let peak = 0;
    const gate = createUploadGate({ maxConcurrent: 2, maxQueued: 10 });

    const app = express();
    app.use('/upload', gate);
    app.post('/upload', async (_req, res) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 50));
      active--;
      res.status(201).json({ ok: true });
    });

    const { server, base } = await listen(app);
    try {
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          fetch(`${base}/upload`, { method: 'POST', body: 'x' })
        )
      );
      for (const r of responses) expect(r.status).toBe(201);
      expect(peak).toBeLessThanOrEqual(2);
      expect(peak).toBe(2); // saturation actually reached
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);

  it('sheds overflow beyond the queue with 429', async () => {
    const gate = createUploadGate({ maxConcurrent: 1, maxQueued: 1 });

    const app = express();
    app.use('/upload', gate);
    app.post('/upload', async (_req, res) => {
      await new Promise((r) => setTimeout(r, 200));
      res.status(201).json({ ok: true });
    });

    const { server, base } = await listen(app);
    try {
      // 3 requests: 1 active + 1 queued + 1 overflow → the third gets 429.
      const responses = await Promise.all([
        fetch(`${base}/upload`, { method: 'POST', body: 'x' }),
        fetch(`${base}/upload`, { method: 'POST', body: 'x' }),
        fetch(`${base}/upload`, { method: 'POST', body: 'x' }),
      ]);
      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 201, 429]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);

  it('rejectOversize drops oversized Content-Length with 413 before buffering', async () => {
    const app = express();
    app.use('/upload', rejectOversize(1024));
    app.post('/upload', (_req, res) => res.status(201).json({ ok: true }));

    const { server, base } = await listen(app);
    try {
      const ok = await fetch(`${base}/upload`, { method: 'POST', body: 'small' });
      expect(ok.status).toBe(201);

      // Node sets Content-Length automatically from the body.
      const big = await fetch(`${base}/upload`, { method: 'POST', body: 'y'.repeat(2048) });
      expect(big.status).toBe(413);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);

  it('releases slots when clients abort mid-request (close event)', async () => {
    const gate = createUploadGate({ maxConcurrent: 1, maxQueued: 5 });

    const app = express();
    app.use('/upload', gate);
    app.post('/upload', async (_req, res) => {
      await new Promise((r) => setTimeout(r, 80));
      if (!res.writableEnded) res.status(201).json({ ok: true });
    });

    const { server, base } = await listen(app);
    try {
      // First request aborted after headers are sent — the close event must
      // free the single slot so the follow-up request is not stuck behind it.
      const aborter = new AbortController();
      const p = fetch(`${base}/upload`, { method: 'POST', body: 'x', signal: aborter.signal });
      setTimeout(() => aborter.abort(), 10);
      await p.catch(() => {});

      // Allow release handlers to run.
      await new Promise((r) => setTimeout(r, 120));

      const followUp = await fetch(`${base}/upload`, { method: 'POST', body: 'x' });
      expect(followUp.status).toBe(201);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);

  it('does not leak semaphore slots when QUEUED requests abort (BUG-04 regression)', async () => {
    const gate = createUploadGate({ maxConcurrent: 1, maxQueued: 5 });

    const app = express();
    app.use('/upload', gate);
    app.post('/upload', async (_req, res) => {
      await new Promise((r) => setTimeout(r, 60));
      if (!res.writableEnded) res.status(201).json({ ok: true });
    });

    const { server, base } = await listen(app);
    try {
      // Request 1 occupies the only slot. Request 2 queues behind it, then
      // aborts while still queued. Before the fix its dead `enter` stayed in
      // the queue; when dequeued it incremented `active` with no future
      // release, permanently shrinking capacity to zero.
      const occupier = fetch(`${base}/upload`, { method: 'POST', body: 'x' });
      const queuedAborter = new AbortController();
      const queued = fetch(`${base}/upload`, { method: 'POST', body: 'x', signal: queuedAborter.signal });
      // Give request 2 time to enter the queue, then abort it.
      await new Promise((r) => setTimeout(r, 15));
      queuedAborter.abort();
      await queued.catch(() => {});
      await occupier;

      // Let close/finish handlers settle.
      await new Promise((r) => setTimeout(r, 100));

      // Capacity must be fully restored: several sequential requests succeed
      // and none hang. With the leak, `active` stays pinned at maxConcurrent
      // and these would queue forever until the test times out.
      for (let i = 0; i < 3; i++) {
        const r = await fetch(`${base}/upload`, { method: 'POST', body: 'x' });
        expect(r.status).toBe(201);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);
});
