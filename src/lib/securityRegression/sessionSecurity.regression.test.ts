/**
 * Security regression — session & request guards (Next.js port).
 *
 * Covers the auth behaviors that had to survive the Express → Next.js port:
 *   - missing/invalid session → 401
 *   - tokenVersion invalidation after password change → 401
 *   - suspended accounts → 401
 *   - must_change_password gate with allowlist → 403 PASSWORD_CHANGE_REQUIRED
 *   - CSRF double-submit (missing / wrong / cross-origin → 403)
 *   - permission-only RBAC guard (no role-string gates)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'regression-jwt-secret';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);
});

vi.mock('../../../server/supabase', () => {
  const s = { from: () => { throw new Error('not initialised'); } };
  return { supabase: s, supabaseAuth: s };
});
vi.mock('../../../server/supabaseAdmin', () => {
  const s = { from: () => { throw new Error('not initialised'); } };
  return { supabaseAdmin: s };
});
vi.mock('../../../server/broadcast', () => ({ broadcast: vi.fn() }));
vi.mock('../../../server/services/notifyEmails', () => ({ notifyByEmail: vi.fn(), appHomeUrl: () => 'http://localhost' }));
vi.mock('../../../server/services/webhookDispatcher', () => ({ dispatchWebhook: vi.fn(async () => {}) }));

import { NextRequest } from 'next/server';
import { requireSession, validateCsrf } from '../../../lib/server/session';
import { guardRequest } from '../../../lib/server/apiContext';
import { seedStore, installFakeSupabase, authedRequest, unauthenticatedRequest, makeUserRow } from './helpers';
import type { TableStore } from '../../../tests/helpers/fakeSupabase';

let store: TableStore;

beforeEach(() => {
  store = installFakeSupabase(seedStore());
});

describe('requireSession (Next.js port of requireAuth)', () => {
  it('rejects requests without a session token', async () => {
    const res = await requireSession(unauthenticatedRequest('/api/tickets'));
    expect(res).toBeInstanceOf(Response);
    const body = await (res as Response).json();
    expect((res as Response).status).toBe(401);
    expect(body.error).toBe('Authentication required');
  });

  it('accepts a valid session cookie and returns the user', async () => {
    const req = authedRequest('/api/tickets', {});
    const ctx = await requireSession(req);
    expect(ctx).not.toBeInstanceOf(Response);
    const user = (ctx as { user: { id: string; role: string } }).user;
    expect(user.id).toBe('usr-agent');
    expect(user.role).toBe('BU_SUPPORT_L1');
  });

  it('invalidates the session when tokenVersion no longer matches the user row', async () => {
    store.users = [makeUserRow({ token_version: 7 })];
    const req = authedRequest('/api/tickets', { tokenVersion: 1 });
    const res = await requireSession(req);
    expect(res).toBeInstanceOf(Response);
    const body = await (res as Response).json();
    expect((res as Response).status).toBe(401);
    expect(body.error).toBe('Session invalidated by password change');
  });

  it('rejects suspended accounts', async () => {
    store.users = [makeUserRow({ is_active: false })];
    const req = authedRequest('/api/tickets', {});
    const res = await requireSession(req);
    expect(res).toBeInstanceOf(Response);
    const body = await (res as Response).json();
    expect((res as Response).status).toBe(401);
    expect(body.error).toBe('Account suspended');
  });

  it('blocks must_change_password accounts off the allowlist and lets allowlisted paths through', async () => {
    store.users = [makeUserRow({ must_change_password: true })];

    const blocked = await requireSession(authedRequest('/api/tickets/tkt-1', {}));
    expect(blocked).toBeInstanceOf(Response);
    const blockedBody = await (blocked as Response).json();
    expect((blocked as Response).status).toBe(403);
    expect(blockedBody.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const allowed = await requireSession(authedRequest('/api/auth/me', {}));
    expect(allowed).not.toBeInstanceOf(Response);
  });
});

describe('validateCsrf (double-submit + same-origin)', () => {
  it('rejects a state-changing request without the CSRF header', () => {
    const req = authedRequest('/api/tickets/tkt-1', {}, { method: 'PATCH', body: {} });
    // Strip the header to simulate a missing token.
    const headers = new Headers(req.headers);
    headers.delete('x-csrf-token');
    const stripped = new NextRequest(req.url, { method: 'PATCH', headers, body: JSON.stringify({}) });
    const res = validateCsrf(stripped as never);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.error).toBe('Invalid CSRF token');
    }
  });

  it('rejects a mismatched CSRF token', () => {
    const req = authedRequest('/api/tickets/tkt-1', {}, { method: 'PATCH', body: {}, headers: { 'x-csrf-token': 'wrong-value' } });
    const res = validateCsrf(req as never);
    expect(res.ok).toBe(false);
  });

  it('accepts a matching double-submit token', () => {
    const req = authedRequest('/api/tickets/tkt-1', {}, { method: 'PATCH', body: {} });
    const res = validateCsrf(req as never);
    expect(res.ok).toBe(true);
  });

  it('rejects cross-origin requests even with a valid token', () => {
    const req = authedRequest('/api/tickets/tkt-1', {}, { method: 'PATCH', body: {}, headers: { origin: 'https://evil.example' } });
    const res = validateCsrf(req as never);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('Cross-origin request rejected');
    }
  });
});

describe('guardRequest (permission-only RBAC)', () => {
  it('returns 403 when the role lacks the requested permission', async () => {
    const req = authedRequest('/api/tickets/tkt-1', {}); // L1 has no tickets:delete
    const res = await guardRequest(req, 'tickets:delete');
    expect(res).toBeInstanceOf(Response);
    const body = await (res as Response).json();
    expect((res as Response).status).toBe(403);
    expect(body.error).toBe('Requires permission: tickets:delete');
  });

  it('lets a role with the permission through and exposes the session', async () => {
    const req = authedRequest('/api/tickets/tkt-1', {});
    const guard = await guardRequest(req, 'tickets:view');
    expect(guard).not.toBeInstanceOf(Response);
    expect((guard as { session: { user: { id: string } } }).session.user.id).toBe('usr-agent');
  });

  it('denies CUSTOMER role everything beyond its narrow permission set', async () => {
    store.users = [makeUserRow({ id: 'usr-cust', role: 'CUSTOMER', bu: 'BU-A' })];
    const req = authedRequest('/api/escalation/rules', { id: 'usr-cust', role: 'CUSTOMER' });
    const res = await guardRequest(req, 'admin:config:read');
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });
});

