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
    'tags.tag_taxonomy': [
      { id: 'tag-1', name: 'payment-issue', description: 'Payment processing issues', color: '#ef4444', parent_id: null, active: true, tenant_id: ALPHA, created_at: '2026-01-01T00:00:00Z' },
      { id: 'tag-2', name: 'integration', description: 'Integration/API issues', color: '#8b5cf6', parent_id: null, active: true, tenant_id: ALPHA, created_at: '2026-01-01T00:00:00Z' },
      { id: 'tag-3', name: 'inactive-tag', description: 'Old tag', color: '#999', parent_id: null, active: false, tenant_id: ALPHA, created_at: '2026-01-01T00:00:00Z' },
    ],
    'tags.ticket_tags': [
      { id: 'tt-1', ticket_id: '00000000-0000-0000-0000-000000000001', tag_id: 'tag-1', tagged_by: 'Admin', created_at: '2026-01-01T00:00:00Z' },
    ],
    'kb.kb_article_versions': [
      { id: 'kbv-1', article_id: 'kb-1', version: 1, title: 'How to reset password', category: 'Playbook', content: 'Step 1...', tags: ['password'], change_notes: 'Initial', edited_by: 'Admin', created_at: '2026-01-01T00:00:00Z' },
    ],
    'kb.kb_article_feedback': [
      { id: 'kbf-1', article_id: 'kb-1', user_id: 'usr-admin', rating: 4, comment: 'Helpful', created_at: '2026-01-01T00:00:00Z' },
    ],
    'kb.kb_article_views': [
      { id: 'kbvw-1', article_id: 'kb-1', user_id: 'usr-admin', viewed_at: '2026-01-15T10:00:00Z' },
    ],
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
  Object.assign(supabase, createFakeSupabase(store));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(() => { server?.close(); });

describe('Tags + KB domain', () => {
  let adminSession: Session;
  beforeEach(async () => { adminSession = await login('admin@4core.com'); });

  // ── Tags ────────────────────────────────────────────────

  describe('GET /tags', () => {
    it('returns active tags', async () => {
      const res = await fetch(`${base}/tags`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.every((t: Record<string, unknown>) => t.active === true)).toBe(true);
      expect(data.some((t: Record<string, unknown>) => t.name === 'payment-issue')).toBe(true);
    });
  });

  describe('POST /tags', () => {
    it('creates a new tag', async () => {
      const res = await fetch(`${base}/tags`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'new-tag', description: 'A new tag', color: '#10b981' }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.name).toBe('new-tag');
    });
  });

  describe('DELETE /tags/:id', () => {
    it('soft-deletes a tag', async () => {
      const res = await fetch(`${base}/tags/tag-1`, {
        method: 'DELETE',
        headers: authedHeaders(adminSession),
      });
      expect(res.status).toBe(200);
    });
  });

  // ── Ticket Tags ─────────────────────────────────────────

  describe('GET /tickets/:ticketId/tags', () => {
    it('returns tags for a ticket', async () => {
      const res = await fetch(`${base}/tickets/00000000-0000-0000-0000-000000000001/tags`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].ticket_id).toBe('00000000-0000-0000-0000-000000000001');
    });
  });

  describe('POST /tickets/tags', () => {
    it('adds a tag to a ticket', async () => {
      const res = await fetch(`${base}/tickets/tags`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: '00000000-0000-0000-0000-000000000001', tagId: 'tag-2' }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.tag_id).toBe('tag-2');
    });
  });

  // ── KB Versions ─────────────────────────────────────────

  describe('GET /kb/:articleId/versions', () => {
    it('returns KB article versions', async () => {
      const res = await fetch(`${base}/kb/kb-1/versions`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data[0].version).toBe(1);
    });
  });

  // ── KB Feedback ─────────────────────────────────────────

  describe('GET /kb/:articleId/feedback', () => {
    it('returns feedback for an article', async () => {
      const res = await fetch(`${base}/kb/kb-1/feedback`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].rating).toBe(4);
    });
  });

  describe('POST /kb/:articleId/feedback', () => {
    it('submits feedback for an article', async () => {
      const res = await fetch(`${base}/kb/kb-1/feedback`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, comment: 'Great article' }),
      });
      expect(res.status).toBe(201);
    });

    it('rejects invalid rating', async () => {
      const res = await fetch(`${base}/kb/kb-1/feedback`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 6, comment: 'Too high' }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── KB Stats ────────────────────────────────────────────

  describe('GET /kb/:articleId/stats', () => {
    it('returns view and feedback stats', async () => {
      const res = await fetch(`${base}/kb/kb-1/stats`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalViews).toBe(1);
      expect(data.totalFeedback).toBe(1);
      expect(data.avgRating).toBe(4);
    });
  });
});
