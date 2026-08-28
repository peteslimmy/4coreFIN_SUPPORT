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
import { requireCsrf, hashPassword, type AuthedRequest } from '../../server/auth';
import { createFakeSupabase, type TableStore } from '@/tests/helpers/fakeSupabase';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

function seedStore(): TableStore {
  const pass = hashPassword(PASSWORD);
  return {
    users: [
      { id: 'usr-admin', name: 'Admin', email: 'admin@4core.com', password_hash: pass, role: 'SUPER_ADMIN', bu: 'ALL', phone: '', tenant_id: ALPHA },
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
  };
}

let base: string;
let server: Server | undefined;

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use('/api', (req, res, next) => requireCsrf(req as unknown as AuthedRequest, res, next));
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

beforeEach(async () => {
  const store = seedStore();
  store['identity.roles'] = [
    { id: 'role-1', name: 'SUPER_ADMIN', description: 'Full system access', role_type: 'system', status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'role-2', name: 'BU_SUPPORT_L1', description: 'Level 1 BU support', role_type: 'system', status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'role-3', name: 'PARTNER', description: 'Payment partner access', role_type: 'system', status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ];
  store['identity.permissions'] = [
    { id: 'perm-1', code: 'tickets:view', description: null, resource: 'tickets', action: 'view', created_at: '2026-01-01T00:00:00Z' },
    { id: 'perm-2', code: 'tickets:create', description: null, resource: 'tickets', action: 'create', created_at: '2026-01-01T00:00:00Z' },
    { id: 'perm-3', code: 'admin:config', description: null, resource: 'admin', action: 'config', created_at: '2026-01-01T00:00:00Z' },
  ];
  store['identity.role_permissions'] = [
    { role_id: 'role-2', permission_id: 'perm-1' },
    { role_id: 'role-2', permission_id: 'perm-2' },
    { role_id: 'role-3', permission_id: 'perm-1' },
  ];
  store['identity.user_roles'] = [];

  Object.assign(supabase, createFakeSupabase(store));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(() => { server?.close(); });

describe('Identity domain', () => {
  let adminSession: Session;

  beforeEach(async () => {
    adminSession = await login('admin@4core.com');
  });

  describe('GET /identity/roles', () => {
    it('returns list of roles', async () => {
      const res = await fetch(`${base}/identity/roles`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data.some((r: Record<string, unknown>) => r.name === 'SUPER_ADMIN')).toBe(true);
    });
  });

  describe('GET /identity/roles/:id', () => {
    it('returns a single role with permissions', async () => {
      const res = await fetch(`${base}/identity/roles/role-2`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe('BU_SUPPORT_L1');
      expect(Array.isArray(data.permissions)).toBe(true);
    });

    it('returns 404 for unknown role', async () => {
      const res = await fetch(`${base}/identity/roles/nonexistent`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /identity/roles', () => {
    it('creates a new custom role', async () => {
      const res = await fetch(`${base}/identity/roles`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CUSTOM_ROLE', description: 'Test role' }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.name).toBe('CUSTOM_ROLE');
      expect(data.role_type).toBe('custom');
    });
  });

  describe('GET /identity/permissions', () => {
    it('returns list of permissions', async () => {
      const res = await fetch(`${base}/identity/permissions`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data.some((p: Record<string, unknown>) => p.code === 'tickets:view')).toBe(true);
    });
  });

  describe('GET /identity/roles/:id/permissions', () => {
    it('returns permission codes for a role', async () => {
      const res = await fetch(`${base}/identity/roles/role-2/permissions`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toContain('tickets:view');
      expect(data).toContain('tickets:create');
    });
  });
});
