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
import { createFakeSupabase, type TableStore } from '@/tests/helpers/fakeSupabase';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

function seedStore(): TableStore {
  const pass = hashPassword(PASSWORD);
  return {
    users: [
      { id: 'usr-admin', name: 'Admin', email: 'admin@4core.com', password_hash: pass, role: 'SUPER_ADMIN', bu: 'ALL', phone: '', tenant_id: ALPHA },
    ],
    tickets: [], comments: [], evidence: [], audit_logs: [], watcher_notifications: [],
    major_incidents: [], customers: [], app_config: [], sla_rules: [], holidays: [],
    ticket_templates: [], kb_articles: [],
    'notify.preferences': [
      { id: 'np-1', user_id: 'usr-admin', email_enabled: true, push_enabled: false, sms_enabled: false, slack_enabled: false, teams_enabled: false, quiet_hours: { enabled: false, start: '22:00', end: '07:00' }, categories: { sla: true, assignment: true, comment: true, status_change: true, major_incident: true }, tenant_id: ALPHA, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    'notify.templates': [
      { id: 'nt-1', code: 'TICKET_ASSIGNED', name: 'Ticket Assigned', channel: 'email', subject: 'Assigned: {{ticketId}}', body_html: '<p>Assigned</p>', body_text: 'Assigned', variables: ['ticketId'], active: true, tenant_id: ALPHA, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'nt-2', code: 'SLA_BREACH', name: 'SLA Breach', channel: 'email', subject: 'Breach: {{ticketId}}', body_html: '<p>Breach</p>', body_text: 'Breach', variables: ['ticketId'], active: true, tenant_id: ALPHA, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    'notify.delivery_log': [
      { id: 'dl-1', template_code: 'SLA_BREACH', channel: 'email', recipient: 'user@test.com', subject: 'Breach: tkt-1', status: 'sent', error: null, metadata: {}, sent_at: '2026-01-15T10:00:00Z', delivered_at: null, tenant_id: ALPHA, created_at: '2026-01-15T10:00:00Z' },
    ],
  };
}

let base: string;
let server: Server | undefined;

const app = express();
app.use(express.json({ limit: "5mb" }));
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

beforeEach(async () => {
  const store = seedStore();
  Object.assign(supabase, createFakeSupabase(store));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(() => { server?.close(); });

describe('Notification Engine domain', () => {
  let adminSession: Session;
  beforeEach(async () => { adminSession = await login('admin@4core.com'); });

  describe('GET /notifications/preferences', () => {
    it('returns user preferences', async () => {
      const res = await fetch(`${base}/notifications/preferences`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.email_enabled).toBe(true);
    });

    it('returns defaults when no preferences exist', async () => {
      const store = seedStore();
      store['notify.preferences'] = [];
      Object.assign(supabase, createFakeSupabase(store));
      const res = await fetch(`${base}/notifications/preferences`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.email_enabled).toBe(true);
    });
  });

  describe('PUT /notifications/preferences', () => {
    it('updates user preferences', async () => {
      const res = await fetch(`${base}/notifications/preferences`, {
        method: 'PUT',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailEnabled: false, pushEnabled: true }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });
  });

  describe('GET /notifications/templates', () => {
    it('returns notification templates', async () => {
      const res = await fetch(`${base}/notifications/templates`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((t: any) => t.code === 'TICKET_ASSIGNED')).toBe(true);
    });
  });

  describe('GET /notifications/templates/:code', () => {
    it('returns a single template', async () => {
      const res = await fetch(`${base}/notifications/templates/TICKET_ASSIGNED`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.code).toBe('TICKET_ASSIGNED');
    });

    it('returns 404 for unknown template', async () => {
      const res = await fetch(`${base}/notifications/templates/UNKNOWN`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /notifications/delivery-log', () => {
    it('returns delivery log', async () => {
      const res = await fetch(`${base}/notifications/delivery-log`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.items)).toBe(true);
    });
  });
});
