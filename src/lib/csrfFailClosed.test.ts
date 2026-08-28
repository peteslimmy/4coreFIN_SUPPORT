import { describe, it, expect } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { requireCsrf, type AuthedRequest } from '../../server/auth';

/**
 * Regression coverage for the requireCsrf middleware (BUG-01):
 * requests without a session cookie must fail closed when no same-origin
 * Referer can be verified, instead of silently passing through.
 */

function listen(app: express.Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0);
    server.once('listening', () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

const SESSION = '4c_session=abc123';
const CSRF_COOKIE = '4c_csrf=tok456';

async function setupApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', (req, res, next) => requireCsrf(req as unknown as AuthedRequest, res, next));
  let reached = 0;
  app.post('/api/thing', (_req, res) => {
    reached++;
    res.status(201).json({ ok: true });
  });
  const { server, base } = await listen(app);
  return {
    base,
    getReached: () => reached,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('requireCsrf fail-closed (BUG-01 regression)', () => {
  it('rejects state-changing requests with no cookie and no Referer (401)', async () => {
    const h = await setupApp();
    try {
      const res = await fetch(`${h.base}/api/thing`, { method: 'POST' });
      expect(res.status).toBe(401);
      expect(h.getReached()).toBe(0);
    } finally {
      await h.close();
    }
  });

  it('rejects requests whose Referer is cross-origin (403)', async () => {
    const h = await setupApp();
    try {
      const res = await fetch(`${h.base}/api/thing`, {
        method: 'POST',
        headers: { Referer: 'https://evil.example.com/form' },
      });
      expect(res.status).toBe(403);
      expect(h.getReached()).toBe(0);
    } finally {
      await h.close();
    }
  });

  it('allows no-cookie requests carrying a same-origin Referer', async () => {
    const h = await setupApp();
    try {
      const res = await fetch(`${h.base}/api/thing`, {
        method: 'POST',
        headers: { Referer: `${h.base}/page` },
      });
      // Same-origin referer satisfies CSRF; handler runs (may then 404/401 on
      // auth, but must NOT be blocked by CSRF).
      expect(res.status).not.toBe(403);
      expect(h.getReached()).toBe(1);
    } finally {
      await h.close();
    }
  });

  it('enforces double-submit when a session cookie is present', async () => {
    const h = await setupApp();
    try {
      const bad = await fetch(`${h.base}/api/thing`, {
        method: 'POST',
        headers: { Cookie: `${SESSION}; ${CSRF_COOKIE}` },
      });
      expect(bad.status).toBe(403);

      const good = await fetch(`${h.base}/api/thing`, {
        method: 'POST',
        headers: { Cookie: `${SESSION}; ${CSRF_COOKIE}`, 'X-CSRF-Token': 'tok456' },
      });
      expect(good.status).not.toBe(403);
      expect(good.status).not.toBe(401);
    } finally {
      await h.close();
    }
  });

  it('exempts the machine-to-machine email ingest webhook', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', (req, res, next) => requireCsrf(req as unknown as AuthedRequest, res, next));
    let reached = false;
    app.post('/api/email/webhook', (_req, res) => {
      reached = true;
      res.status(202).json({ ok: true });
    });
    const server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const res = await fetch(`${base}/api/email/webhook`, { method: 'POST' });
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
      expect(reached).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
