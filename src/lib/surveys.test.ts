import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { vi } from 'vitest';

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
    major_incidents: [], sla_rules: [], holidays: [], ticket_templates: [],
    customers: [], kb_articles: [], app_config: [],
    'surveys.survey_campaigns': [
      { id: 'camp-1', name: 'Post-Resolution CSAT', description: 'Auto-sent on resolve', type: 'CSAT', question: 'How satisfied?', is_active: true, trigger_type: 'ticket_resolved', created_by: 'system', tenant_id: ALPHA },
    ],
    'surveys.survey_responses': [
      { id: 'resp-1', campaign_id: 'camp-1', ticket_id: 'tkt-1', responder_email: 'alice@acme.com', rating: 5, comment: 'Great!', responded_at: '2026-08-20T10:00:00Z', tenant_id: ALPHA },
      { id: 'resp-2', campaign_id: 'camp-1', ticket_id: 'tkt-2', responder_email: 'bob@beta.com', rating: 3, comment: '', responded_at: '2026-08-20T11:00:00Z', tenant_id: ALPHA },
    ],
    'surveys.campaign_stats': [],
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

function authedHeaders(s: Session): Record<string, string> {
  const headers: Record<string, string> = { Cookie: `${s.session}; ${s.csrf}` };
  if (s.csrf) headers['X-CSRF-Token'] = s.csrf.split('=')[1];
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

describe('Survey/CSAT Engine', () => {
  let adminSession: Session;
  beforeEach(async () => { adminSession = await login('admin@4core.com'); });

  describe('GET /surveys/campaigns', () => {
    it('returns seeded campaigns', async () => {
      const res = await fetch(`${base}/surveys/campaigns`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data.some((c: any) => c.name === 'Post-Resolution CSAT')).toBe(true);
    });
  });

  describe('POST /surveys/campaigns', () => {
    it('creates a new campaign', async () => {
      const res = await fetch(`${base}/surveys/campaigns`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'NPS Survey', question: 'How likely to recommend?', type: 'NPS' }),
      });
      expect(res.status).toBe(201);
      const camp = await res.json();
      expect(camp.name).toBe('NPS Survey');
      expect(camp.id).toBeDefined();
    });

    it('rejects missing question', async () => {
      const res = await fetch(`${base}/surveys/campaigns`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Campaign' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /surveys/campaigns/:id', () => {
    it('updates a campaign', async () => {
      const res = await fetch(`${base}/surveys/campaigns/camp-1`, {
        method: 'PATCH',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated CSAT' }),
      });
      expect(res.status).toBe(200);
      const camp = await res.json();
      expect(camp.name).toBe('Updated CSAT');
    });
  });

  describe('DELETE /surveys/campaigns/:id', () => {
    it('deletes a campaign', async () => {
      const res = await fetch(`${base}/surveys/campaigns/camp-1`, {
        method: 'DELETE',
        headers: authedHeaders(adminSession),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('returns 404 for unknown campaign', async () => {
      const res = await fetch(`${base}/surveys/campaigns/nonexistent`, {
        method: 'DELETE',
        headers: authedHeaders(adminSession),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /surveys/submit', () => {
    it('submits a survey response', async () => {
      const res = await fetch(`${base}/surveys/submit`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: 'camp-1', ticket_id: 'tkt-1', responder_email: 'test@test.com', rating: 4, comment: 'Good' }),
      });
      expect(res.status).toBe(201);
      const resp = await res.json();
      expect(resp.rating).toBe(4);
      expect(resp.id).toBeDefined();
    });

    it('rejects rating outside 1-5', async () => {
      const res = await fetch(`${base}/surveys/submit`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: 'camp-1', ticket_id: 'tkt-1', responder_email: 'test@test.com', rating: 6 }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects invalid campaign id', async () => {
      const res = await fetch(`${base}/surveys/submit`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: '00000000-0000-0000-0000-000000000000', ticket_id: 'tkt-1', responder_email: 'test@test.com', rating: 4 }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /surveys/overall', () => {
    it('returns aggregated stats', async () => {
      const res = await fetch(`${base}/surveys/overall`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.total_campaigns).toBe('number');
      expect(typeof data.total_responses).toBe('number');
      expect(typeof data.overall_avg_rating).toBe('number');
    });
  });

  describe('auth required', () => {
    it('GET /surveys/campaigns returns 401', async () => {
      const res = await fetch(`${base}/surveys/campaigns`);
      expect(res.status).toBe(401);
    });
  });
});
