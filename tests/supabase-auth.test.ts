import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import express from 'express';
import { createApiRouter } from '../server/routes';
import { requireCsrf } from '../server/auth';
import { resetDatabase, supabase } from './helpers/testDb';
import { createTestUser } from './helpers/testUsers';
import './helpers/conftest';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

let base: string;
let server: Server | undefined;

const app = express();
app.use(express.json());
app.use('/api', (req, res, next) => requireCsrf(req as any, res, next));
app.use('/api', createApiRouter());

function authedHeaders(sessionCookie: string, csrfCookie: string) {
  const headers: Record<string, string> = { Cookie: `${sessionCookie}; ${csrfCookie}` };
  const csrfValue = csrfCookie.split('=')[1];
  if (csrfValue) headers['X-CSRF-Token'] = csrfValue;
  return headers;
}

async function login(email: string): Promise<{ session: string; csrf: string }> {
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

beforeEach(async () => {
  process.env.AUTH_PROVIDER = 'supabase';
  await resetDatabase();
  await createTestUser({
    id: 'usr-su',
    name: 'Sarah',
    email: 'sarah@alpha.com',
    password: PASSWORD,
    role: 'BU_SUPPORT',
    bu: 'ALPHA',
    phone: '',
  });
  await createTestUser({
    id: 'usr-admin',
    name: 'Admin',
    email: 'admin@4core.com',
    password: PASSWORD,
    role: 'SUPER_ADMIN',
    bu: 'ALL',
    phone: '',
  });
  await createTestUser({
    id: 'usr-suspended',
    name: 'Suspended',
    email: 'suspended@alpha.com',
    password: PASSWORD,
    role: 'BU_SUPPORT',
    bu: 'ALPHA',
    phone: '',
    isActive: false,
    activationToken: null,
    mustChangePassword: false,
  });
  await supabase.from('app_config').insert([{ key: 'businessUnits', value: ['ALPHA', 'BETA'] }]);
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
      body: JSON.stringify({ email: 'sarah@alpha.com', password: PASSWORD }),
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
      body: JSON.stringify({ name: 'New Payment Partner', email: 'partner@beta.com', password: 'password123', bu: 'BETA' }),
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

  it('rejects login for a suspended app user', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'suspended@alpha.com', password: PASSWORD }),
    });
    expect(res.status).toBe(403);
  });
});

describe('Supabase Auth admin provisioning', () => {
  it('creates a user with a Supabase Auth identity', async () => {
    const { session, csrf } = await login('admin@4core.com');
    const res = await fetch(`${base}/users`, {
      method: 'POST',
      headers: { ...authedHeaders(session, csrf), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Provisioned', email: 'new@beta.com', role: 'PARTNER', partner: 'BETA', password: 'password123' }),
    });
    expect(res.status).toBe(201);
    const { data } = await supabase.from('users').select('*').eq('email', 'new@beta.com');
    const row = (data as any[])[0];
    expect(row.auth_user_id).toBeTruthy();
  });

  it('deletes the Supabase Auth identity when a user is deleted', async () => {
    const { session, csrf } = await login('admin@4core.com');
    const deleteSpy = vi.spyOn(supabase.auth.admin, 'deleteUser').mockImplementation(async (id: string) => {
      return supabase.auth.admin.deleteUser(id);
    });
    const res = await fetch(`${base}/users/usr-suspended`, {
      method: 'DELETE',
      headers: authedHeaders(session, csrf),
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('users').select('*').eq('id', 'usr-suspended');
    expect((data as any[]).length).toBe(0);
    deleteSpy.mockRestore();
  });

  it('generates a secure temporary password for admin provisioning', async () => {
    const { session, csrf } = await login('admin@4core.com');
    const res = await fetch(`${base}/users/generate-password`, {
      method: 'POST',
      headers: authedHeaders(session, csrf),
    });
    expect(res.status).toBe(200);
    const { password } = (await res.json()) as any;
    expect(typeof password).toBe('string');
    expect(password.length).toBeGreaterThanOrEqual(12);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
  });

  it('creates a user pending activation without exposing the activation token', async () => {
    const { session, csrf } = await login('admin@4core.com');
    const res = await fetch(`${base}/users`, {
      method: 'POST',
      headers: { ...authedHeaders(session, csrf), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Provisioned Two', email: 'new2@beta.com', role: 'PARTNER', partner: 'BETA', password: 'TempPass1!' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.activationPending).toBe(true);
    expect(body.invitationSent).toBe(false);
    expect(body).not.toHaveProperty('activationToken');
    const { data } = await supabase.from('users').select('*').eq('email', 'new2@beta.com');
    const row = (data as any[])[0];
    expect(row.is_active).toBe(false);
    expect(row.activation_token).toBeTruthy();
    const listRes = await fetch(`${base}/users`, {
      headers: authedHeaders(session, csrf),
    });
    const rows = (await listRes.json()) as any[];
    expect(JSON.stringify(rows)).not.toContain(row.activation_token);
  });

  it('resends an invitation which rotates the temporary password for a pending user', async () => {
    await createTestUser({
      id: 'usr-pend2',
      name: 'Pending Two',
      email: 'pend2@alpha.com',
      password: 'OldTemp1!',
      role: 'BU_SUPPORT',
      bu: 'ALPHA',
      phone: '',
      isActive: false,
      mustChangePassword: true,
      activationToken: 'old-token',
    });
    const { session, csrf } = await login('admin@4core.com');
    const res = await fetch(`${base}/users/usr-pend2/resend-invite`, {
      method: 'POST',
      headers: authedHeaders(session, csrf),
    });
    expect(res.status).toBe(200);
    const { data } = await supabase.from('users').select('*').eq('id', 'usr-pend2');
    const row = (data as any[])[0];
    expect(row.activation_token).toBeTruthy();
    expect(row.activation_token).not.toBe('old-token');
  });
});

describe('Pending-activation user flow', () => {
  it('allows a pending user to log in with the temporary password', async () => {
    await createTestUser({
      id: 'usr-pending',
      name: 'Pending Hire',
      email: 'pending@alpha.com',
      password: 'TempPass1!',
      role: 'BU_SUPPORT',
      bu: 'ALPHA',
      phone: '',
      isActive: false,
      mustChangePassword: true,
      activationToken: 'tok-pending',
    });
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pending@alpha.com', password: 'TempPass1!' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.pendingActivation).toBe(true);
    expect(body.mustChangePassword).toBe(true);
  });

  it('gates a pending user to password-change endpoints only', async () => {
    await createTestUser({
      id: 'usr-pending',
      name: 'Pending Hire',
      email: 'pending@alpha.com',
      password: 'TempPass1!',
      role: 'BU_SUPPORT',
      bu: 'ALPHA',
      phone: '',
      isActive: false,
      mustChangePassword: true,
      activationToken: 'tok-pending',
    });
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pending@alpha.com', password: 'TempPass1!' }),
    });
    const cookies = (loginRes.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim());
    const session = cookies.find((c) => c.startsWith('4c_session=')) || '';
    const csrf = cookies.find((c) => c.startsWith('4c_csrf=')) || '';

    const forbidden = await fetch(`${base}/users`, {
      headers: authedHeaders(session, csrf),
    });
    expect(forbidden.status).toBe(403);

    const allowed = await fetch(`${base}/auth/me`, {
      headers: authedHeaders(session, csrf),
    });
    expect(allowed.status).toBe(200);
  });

  it('change-password completes activation: activates, clears token and forced flag', async () => {
    await createTestUser({
      id: 'usr-pending',
      name: 'Pending Hire',
      email: 'pending@alpha.com',
      password: 'TempPass1!',
      role: 'BU_SUPPORT',
      bu: 'ALPHA',
      phone: '',
      isActive: false,
      mustChangePassword: true,
      activationToken: 'tok-pending',
    });
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pending@alpha.com', password: 'TempPass1!' }),
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
    const { data } = await supabase.from('users').select('*').eq('id', 'usr-pending');
    const row = (data as any[])[0];
    expect(row.is_active).toBe(true);
    expect(row.must_change_password).toBe(false);
    expect(row.activation_token).toBeNull();
  });

  it('still rejects a suspended user (no activation token) at login', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'suspended@alpha.com', password: PASSWORD }),
    });
    expect(res.status).toBe(403);
  });

  it('exposes activationPending without leaking the raw token in the user list', async () => {
    await createTestUser({
      id: 'usr-pending',
      name: 'Pending Hire',
      email: 'pending@alpha.com',
      password: 'TempPass1!',
      role: 'BU_SUPPORT',
      bu: 'ALPHA',
      phone: '',
      isActive: false,
      mustChangePassword: true,
      activationToken: 'tok-pending',
    });
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@4core.com', password: PASSWORD }),
    });
    const cookies = (loginRes.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim());
    const session = cookies.find((c) => c.startsWith('4c_session=')) || '';
    const csrf = cookies.find((c) => c.startsWith('4c_csrf=')) || '';

    const res = await fetch(`${base}/users`, {
      headers: authedHeaders(session, csrf),
    });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as any[];
    const pending = rows.find((u: any) => u.id === 'usr-pending');
    expect(pending.activationPending).toBe(true);
    expect(pending).not.toHaveProperty('activationToken');
    expect(JSON.stringify(rows)).not.toContain('tok-pending');
  });
});

describe('Supabase password flows', () => {
  it('signals mustChangePassword on login for a temporarily provisioned user', async () => {
    await createTestUser({
      id: 'usr-new',
      name: 'New Hire',
      email: 'newhire@alpha.com',
      password: 'TempPass1!',
      role: 'BU_SUPPORT',
      bu: 'ALPHA',
      phone: '',
      mustChangePassword: true,
    });
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
    await createTestUser({
      id: 'usr-new',
      name: 'New Hire',
      email: 'newhire@alpha.com',
      password: 'TempPass1!',
      role: 'BU_SUPPORT',
      bu: 'ALPHA',
      phone: '',
      mustChangePassword: true,
    });
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
    await createTestUser({
      id: 'usr-new',
      name: 'New Hire',
      email: 'newhire@alpha.com',
      password: 'TempPass1!',
      role: 'BU_SUPPORT',
      bu: 'ALPHA',
      phone: '',
      mustChangePassword: true,
    });
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
    await createTestUser({
      id: 'usr-new',
      name: 'New Hire',
      email: 'newhire@alpha.com',
      password: 'TempPass1!',
      role: 'BU_SUPPORT',
      bu: 'ALPHA',
      phone: '',
      mustChangePassword: true,
    });
    // Resolve the user's real auth identity id so we can present a valid-looking token to the route.
    const { data: userRow } = await supabase.from('users').select('auth_user_id').eq('id', 'usr-new').single();
    const authId = (userRow as any).auth_user_id;
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: authId, email: 'newhire@alpha.com' } },
      error: null,
    });
    (supabase.auth as any).getUser = mockGetUser;

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

describe('Supabase Auth activation toggle — GoTrue ban sync', () => {
  it('bans the Supabase Auth identity when a user is suspended and clears it on reactivation', async () => {
    const { session, csrf } = await login('admin@4core.com');
    const { data: suspendedRow } = await supabase.from('users').select('auth_user_id').eq('id', 'usr-suspended').single();
    const susAuthId = (suspendedRow as any).auth_user_id;

    const spy = vi.spyOn(supabase.auth.admin, 'updateUserById');

    const sessVal = session.split('=')[1];
    const csrfV = csrf.split('=')[1];

    const resSuspend = await fetch(`${base}/users/usr-suspended/activation`, {
      method: 'PATCH',
      headers: { Cookie: `4c_session=${sessVal}; 4c_csrf=${csrfV}`, 'X-CSRF-Token': csrfV, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    expect(resSuspend.status).toBe(200);
    expect(spy).toHaveBeenLastCalledWith(susAuthId, { ban_duration: '876000h' });

    const resActivate = await fetch(`${base}/users/usr-suspended/activation`, {
      method: 'PATCH',
      headers: { Cookie: `4c_session=${sessVal}; 4c_csrf=${csrfV}`, 'X-CSRF-Token': csrfV, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    });
    expect(resActivate.status).toBe(200);
    expect(spy).toHaveBeenLastCalledWith(susAuthId, { ban_duration: 'none' });
    spy.mockRestore();
  });
});

describe('User suspension must follow activation', () => {
  async function seedExtraUsers(extraUsers: any[]) {
    for (const u of extraUsers) {
      await createTestUser({
        id: u.id,
        name: u.name,
        email: u.email,
        password: u.password_plaintext || PASSWORD,
        role: u.role,
        bu: u.bu,
        phone: u.phone || '',
        isActive: u.is_active ?? true,
        mustChangePassword: u.must_change_password ?? false,
        activationToken: u.activation_token ?? null,
      });
    }
  }

  async function supabaseRow(userId: string) {
    const { data } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    return data;
  }

  async function adminLogin() {
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@4core.com', password: PASSWORD }),
    });
    expect(loginRes.status).toBe(200);
    const cs = (name: string) => (loginRes.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim()).find((c) => c.startsWith(`${name}=`)) || '';
    return { csrfV: cs('4c_csrf').split('=')[1], sessVal: cs('4c_session').slice('4c_session='.length) };
  }

  it('rejects suspending an account that is still pending activation', async () => {
    await seedExtraUsers([
      { id: 'usr-pending', name: 'Pending Hire', email: 'pending@alpha.com', password_plaintext: 'whatever', role: 'BU_SUPPORT', bu: 'ALPHA', phone: '', is_active: false, must_change_password: true, activation_token: 'tok-pending' },
    ]);

    const { csrfV, sessVal } = await adminLogin();
    const resSuspend = await fetch(`${base}/users/usr-pending/activation`, {
      method: 'PATCH',
      headers: { Cookie: `4c_session=${sessVal}; 4c_csrf=${csrfV}`, 'X-CSRF-Token': csrfV, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    expect(resSuspend.status).toBe(409);
    expect(await resSuspend.json()).toMatchObject({ error: expect.stringContaining('activated') });
    expect(await supabaseRow('usr-pending')).toMatchObject({ is_active: false, activation_token: 'tok-pending', must_change_password: true });
  });

  it('allows suspending an account that has already been activated', async () => {
    const spy = vi.spyOn(supabase.auth.admin, 'updateUserById');
    await seedExtraUsers([
      { id: 'usr-active', name: 'Active', email: 'active@alpha.com', password_plaintext: 'whatever', role: 'BU_SUPPORT', bu: 'ALPHA', phone: '', is_active: true, must_change_password: false, activation_token: null },
    ]);

    const { data: activeRow } = await supabase.from('users').select('auth_user_id').eq('id', 'usr-active').single();
    const activeAuthId = (activeRow as any).auth_user_id;

    const { csrfV, sessVal } = await adminLogin();
    const resSuspend = await fetch(`${base}/users/usr-active/activation`, {
      method: 'PATCH',
      headers: { Cookie: `4c_session=${sessVal}; 4c_csrf=${csrfV}`, 'X-CSRF-Token': csrfV, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    expect(resSuspend.status).toBe(200);
    expect(spy).toHaveBeenLastCalledWith(activeAuthId, { ban_duration: '876000h' });
    expect(await supabaseRow('usr-active')).toMatchObject({ is_active: false });
    spy.mockRestore();
  });
});