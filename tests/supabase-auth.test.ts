import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

vi.mock('../server/supabase', () => {
  const s = { from: () => { throw new Error('supabase not initialised in this test'); } };
  return { supabase: s, supabaseAuth: s };
});

import express from 'express';
import { supabase } from '../server/supabase';
import { createApiRouter } from '../server/routes';
import { requireCsrf } from '../server/auth';
import { createFakeSupabase, type TableStore } from './helpers/fakeSupabase';

const ALPHA = 'tnt-ALPHA';

function seedStore(): TableStore {
  return {
    users: [
      // auth_user_id matches what the fake's signInWithPassword returns ('auth-<email>').
      { id: 'usr-su', name: 'Sarah', email: 'sarah@alpha.com', password_hash: 'x', password_plaintext: 'whatever', role: 'BU_SUPPORT', bu: 'ALPHA', phone: '', tenant_id: ALPHA, auth_user_id: 'auth-sarah@alpha.com' },
      { id: 'usr-admin', name: 'Admin', email: 'admin@4core.com', password_hash: 'x', password_plaintext: 'whatever', role: 'SUPER_ADMIN', bu: 'ALL', phone: '', tenant_id: ALPHA, auth_user_id: 'auth-admin@4core.com' },
    ],
    tickets: [],
    comments: [],
    evidence: [],
    audit_logs: [],
    watcher_notifications: [],
    major_incidents: [],
    customers: [],
    app_config: [{ key: 'businessUnits', value: ['ALPHA', 'BETA'] }],
    sla_rules: [],
    holidays: [],
    ticket_templates: [],
    kb_articles: [],
  };
}

let base: string;
let server: Server | undefined;

const app = express();
app.use(express.json());
app.use('/api', (req, res, next) => requireCsrf(req as any, res, next));
app.use('/api', createApiRouter());

beforeEach(async () => {
  process.env.AUTH_PROVIDER = 'supabase';
  Object.assign(supabase, createFakeSupabase(seedStore()));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  delete process.env.AUTH_PROVIDER;
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe('Supabase Auth provider', () => {
  it('logs in by resolving the Supabase auth_user_id to an app user', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sarah@alpha.com', password: 'whatever' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.email).toBe('sarah@alpha.com');
    expect(body.user.id).toBe('usr-su');
  });

  it('rejects login when Supabase identity has no provisioned app user', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@alpha.com', password: 'whatever' }),
    });
    expect(res.status).toBe(401);
  });

  it('disables self-registration in favor of admin-only provisioning', async () => {
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Partner', email: 'partner@beta.com', password: 'password123', bu: 'BETA' }),
    });
    expect(res.status).toBe(404);
  });

  it('always reports the Supabase provider regardless of env', async () => {
    const { authProvider, isSupabaseAuth } = await import('../server/auth');
    process.env.AUTH_PROVIDER = 'supabase';
    expect(authProvider()).toBe('supabase');
    expect(isSupabaseAuth()).toBe(true);
    process.env.AUTH_PROVIDER = 'local';
    expect(authProvider()).toBe('supabase');
    expect(isSupabaseAuth()).toBe(true);
    delete process.env.AUTH_PROVIDER;
    expect(authProvider()).toBe('supabase');
    expect(isSupabaseAuth()).toBe(true);
  });
});

function authedHeaders(sessionCookie: string, csrfCookie: string) {
  const headers: Record<string, string> = { Cookie: `${sessionCookie}; ${csrfCookie}` };
  const csrfValue = csrfCookie.split('=')[1];
  if (csrfValue) headers['X-CSRF-Token'] = csrfValue;
  return headers;
}

describe('Supabase Auth admin provisioning', () => {
  it('creates a user with a Supabase Auth identity', async () => {
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@4core.com', password: 'whatever' }),
    });
    expect(loginRes.status).toBe(200);
    const cookies = (loginRes.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim());
    const session = cookies.find((c) => c.startsWith('4c_session=')) || '';
    const csrf = cookies.find((c) => c.startsWith('4c_csrf=')) || '';

    const res = await fetch(`${base}/users`, {
      method: 'POST',
      headers: { ...authedHeaders(session, csrf), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Provisioned', email: 'new@beta.com', role: 'PROVIDER', bu: 'BETA', password: 'password123' }),
    });
    expect(res.status).toBe(201);
    const { data } = await supabase.from('users').select('*').eq('email', 'new@beta.com');
    const row = (data as any[])[0];
    expect(row.auth_user_id).toBe('auth-new@beta.com');
  });

  it('deletes the Supabase Auth identity when a user is deleted', async () => {
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      users: [
        ...seedStore().users,
        { id: 'usr-x', name: 'X', email: 'x@beta.com', password_hash: 'x', role: 'PARTNER', bu: 'BETA', phone: '', tenant_id: ALPHA, auth_user_id: 'auth-x@beta.com' },
      ],
    }));
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@4core.com', password: 'whatever' }),
    });
    const cookies = (loginRes.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim());
    const session = cookies.find((c) => c.startsWith('4c_session=')) || '';
    const csrf = cookies.find((c) => c.startsWith('4c_csrf=')) || '';

    const deleteUserMock = vi.fn(async (_id: string) => ({ error: null }));
    supabase.auth.admin.deleteUser = deleteUserMock;
    const res = await fetch(`${base}/users/usr-x`, {
      method: 'DELETE',
      headers: authedHeaders(session, csrf),
    });
    expect(res.status).toBe(200);
    expect(deleteUserMock).toHaveBeenCalledWith('auth-x@beta.com');
    const { data } = await supabase.from('users').select('*').eq('id', 'usr-x');
    expect((data as any[]).length).toBe(0);
  });
});

describe('Supabase password flows', () => {
  it('signals mustChangePassword on login for a temporarily provisioned user', async () => {
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      users: [
        ...seedStore().users,
        { id: 'usr-new', name: 'New Hire', email: 'newhire@alpha.com', password_hash: 'x', password_plaintext: 'TempPass1!', role: 'BU_SUPPORT', bu: 'ALPHA', phone: '', tenant_id: ALPHA, auth_user_id: 'auth-newhire@alpha.com', must_change_password: true },
      ],
    }));
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newhire@alpha.com', password: 'TempPass1!' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.mustChangePassword).toBe(true);
  });

  it('changes password, verifies via Supabase sign-in, and clears the forced flag', async () => {
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      users: [
        ...seedStore().users,
        { id: 'usr-new', name: 'New Hire', email: 'newhire@alpha.com', password_hash: 'x', password_plaintext: 'TempPass1!', role: 'BU_SUPPORT', bu: 'ALPHA', phone: '', tenant_id: ALPHA, auth_user_id: 'auth-newhire@alpha.com', must_change_password: true },
      ],
    }));
    // Login with the temporary password.
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newhire@alpha.com', password: 'TempPass1!' }),
    });
    const cookies = (loginRes.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim());
    const session = cookies.find((c) => c.startsWith('4c_session=')) || '';
    const csrf = cookies.find((c) => c.startsWith('4c_csrf=')) || '';

    const res = await fetch(`${base}/auth/change-password`, {
      method: 'POST',
      headers: { ...authedHeaders(session, csrf), 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'TempPass1!', newPassword: 'NewPass1!Aa' }),
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('users').select('*').eq('id', 'usr-new');
    const row = (data as any[])[0];
    expect(row.must_change_password).toBe(false);
  });

  it('rejects a password change when the current password is wrong', async () => {
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      users: [
        ...seedStore().users,
        { id: 'usr-new', name: 'New Hire', email: 'newhire@alpha.com', password_hash: 'x', password_plaintext: 'TempPass1!', role: 'BU_SUPPORT', bu: 'ALPHA', phone: '', tenant_id: ALPHA, auth_user_id: 'auth-newhire@alpha.com', must_change_password: true },
      ],
    }));
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newhire@alpha.com', password: 'TempPass1!' }),
    });
    const cookies = (loginRes.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim());
    const session = cookies.find((c) => c.startsWith('4c_session=')) || '';
    const csrf = cookies.find((c) => c.startsWith('4c_csrf=')) || '';

    const res = await fetch(`${base}/auth/change-password`, {
      method: 'POST',
      headers: { ...authedHeaders(session, csrf), 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'WRONG', newPassword: 'NewPass1!Aa' }),
    });
    expect(res.status).toBe(401);
  });

  it('accepts a forgot-password request and returns success without enumeration', async () => {
    const res = await fetch(`${base}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@nowhere.com' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  it('resets the password from a valid Supabase recovery token and clears the flag', async () => {
    Object.assign(supabase, createFakeSupabase({
      ...seedStore(),
      users: [
        ...seedStore().users,
        { id: 'usr-new', name: 'New Hire', email: 'newhire@alpha.com', password_hash: 'x', role: 'BU_SUPPORT', bu: 'ALPHA', phone: '', tenant_id: ALPHA, auth_user_id: 'auth-newhire@alpha.com', must_change_password: true },
      ],
    }));
    const res = await fetch(`${base}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'token-newhire@alpha.com', newPassword: 'ResetPass1!Aa' }),
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('users').select('*').eq('id', 'usr-new');
    const row = (data as any[])[0];
    expect(row.must_change_password).toBe(false);
  });

  it('rejects an invalid or expired reset token', async () => {
    const res = await fetch(`${base}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-real-token-recognized-by-getUser', newPassword: 'ResetPass1!' }),
    });
    expect(res.status).toBe(400);
  });
});