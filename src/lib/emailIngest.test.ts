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
    tickets: [], comments: [], evidence: [], audit_logs: [], watcher_notifications: [],
    major_incidents: [], customers: [], app_config: [], sla_rules: [], holidays: [],
    ticket_templates: [], kb_articles: [],
    'email_ingest.inbound_emails': [
      {
        id: 'em-1', message_id: 'msg-001', from_address: 'user@example.com', from_name: 'Test User',
        to_addresses: ['support@4core.com'], subject: 'Help with payment',
        body_text: 'I have a payment issue', body_html: '<p>I have a payment issue</p>',
        headers: {}, attachments: [], received_at: '2026-01-15T10:00:00Z',
        processed: false, processed_at: null, ticket_id: null, error: null,
        tenant_id: ALPHA, created_at: '2026-01-15T10:00:00Z',
      },
      {
        id: 'em-2', message_id: 'msg-002', from_address: 'admin@4core.com', from_name: 'Admin',
        to_addresses: ['support@4core.com'], subject: 'Already processed',
        body_text: 'Done', body_html: '', headers: {}, attachments: [],
        received_at: '2026-01-14T08:00:00Z', processed: true, processed_at: '2026-01-14T08:30:00Z',
        ticket_id: 'tkt-1', error: null, tenant_id: ALPHA, created_at: '2026-01-14T08:00:00Z',
      },
    ],
    'email_ingest.inbound_rules': [
      { id: 'er-1', match_field: 'from', match_op: 'contains', match_value: '@partner.com', action: 'set_partner', action_value: 'PartnerA', priority: 10, active: true, tenant_id: ALPHA, created_at: '2026-01-01T00:00:00Z' },
    ],
  };
}

let base: string;
let server: Server | undefined;

const app = express();
app.use(express.json({ limit: '5mb' }));
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
  Object.assign(supabase, createFakeSupabase(store));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(() => { server?.close(); });

describe('Email Ingestion domain', () => {
  let adminSession: Session;
  beforeEach(async () => { adminSession = await login('admin@4core.com'); });

  describe('POST /email/webhook', () => {
    it('accepts inbound email and stores it', async () => {
      const res = await fetch(`${base}/email/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'newuser@test.com',
          to: ['support@4core.com'],
          subject: 'New payment issue',
          text: 'Help me please',
          html: '<p>Help me please</p>',
        }),
      });
      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.id).toBeDefined();
    });

    it('deduplicates by Message-Id header', async () => {
      const payload = {
        from: 'dup@test.com',
        to: ['support@4core.com'],
        subject: 'Duplicate',
        text: 'Dup test',
      };
      const headers = { 'Content-Type': 'application/json', 'Message-Id': 'unique-123' };
      const res1 = await fetch(`${base}/email/webhook`, { method: 'POST', headers, body: JSON.stringify(payload) });
      expect(res1.status).toBe(202);
      const res2 = await fetch(`${base}/email/webhook`, { method: 'POST', headers, body: JSON.stringify(payload) });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.duplicate).toBe(true);
    });

    it('rejects invalid email', async () => {
      const res = await fetch(`${base}/email/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'not-an-email', to: [], subject: 'Bad' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /email/inbox', () => {
    it('returns paginated inbox', async () => {
      const res = await fetch(`${base}/email/inbox`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.total).toBeGreaterThanOrEqual(2);
    });

    it('filters by processed status', async () => {
      const res = await fetch(`${base}/email/inbox?processed=false`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items.every((e: Record<string, unknown>) => e.processed === false)).toBe(true);
    });
  });

  describe('GET /email/inbox/:id', () => {
    it('returns a single email', async () => {
      const res = await fetch(`${base}/email/inbox/em-1`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.from_address).toBe('user@example.com');
    });

    it('returns 404 for unknown email', async () => {
      const res = await fetch(`${base}/email/inbox/nonexistent`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /email/inbox/:id/process', () => {
    it('marks email as processed with ticket', async () => {
      const res = await fetch(`${base}/email/inbox/em-1/process`, {
        method: 'PATCH',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: 'tkt-new' }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /email/rules', () => {
    it('returns inbound rules', async () => {
      const res = await fetch(`${base}/email/rules`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /email/rules', () => {
    it('creates a new rule', async () => {
      const res = await fetch(`${base}/email/rules`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchField: 'subject', matchOp: 'contains', matchValue: 'urgent', action: 'set_priority', actionValue: 'P1', priority: 5 }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.match_field).toBe('subject');
    });
  });
});
