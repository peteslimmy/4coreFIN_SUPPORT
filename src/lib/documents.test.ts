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
    'documents.document_folders': [
      { id: 'df-1', name: 'Contracts', parent_id: null, description: 'Contract documents', created_by: 'Admin', tenant_id: ALPHA, created_at: '2026-01-01T00:00:00Z' },
    ],
    'documents.document_registry': [
      {
        id: 'doc-1', title: 'SLA Template', description: 'Standard SLA template', folder_id: 'df-1',
        file_name: 'sla-template.pdf', file_size: 2048, file_type: 'pdf', mime_type: 'application/pdf',
        storage_path: '/docs/sla-template.pdf', version: 1, status: 'active', uploaded_by: 'Admin',
        tags: ['sla', 'template'], metadata: {}, tenant_id: ALPHA,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    'documents.document_versions': [
      { id: 'dv-1', document_id: 'doc-1', version: 1, file_name: 'sla-template.pdf', file_size: 2048, file_type: 'pdf', storage_path: '/docs/sla-template.pdf', change_notes: 'Initial upload', uploaded_by: 'Admin', created_at: '2026-01-01T00:00:00Z' },
    ],
    'documents.document_permissions': [],
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

describe('Document Management domain', () => {
  let adminSession: Session;
  beforeEach(async () => { adminSession = await login('admin@4core.com'); });

  describe('GET /documents/folders', () => {
    it('returns document folders', async () => {
      const res = await fetch(`${base}/documents/folders`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.some((f: Record<string, unknown>) => f.name === 'Contracts')).toBe(true);
    });
  });

  describe('POST /documents/folders', () => {
    it('creates a new folder', async () => {
      const res = await fetch(`${base}/documents/folders`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Invoices', description: 'Invoice documents' }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.name).toBe('Invoices');
    });
  });

  describe('GET /documents', () => {
    it('returns paginated documents', async () => {
      const res = await fetch(`${base}/documents`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by folder', async () => {
      const res = await fetch(`${base}/documents?folderId=df-1`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items.every((d: Record<string, unknown>) => d.folder_id === 'df-1')).toBe(true);
    });
  });

  describe('GET /documents/:id', () => {
    it('returns a single document', async () => {
      const res = await fetch(`${base}/documents/doc-1`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.title).toBe('SLA Template');
    });

    it('returns 404 for unknown document', async () => {
      const res = await fetch(`${base}/documents/nonexistent`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /documents', () => {
    it('creates a document with initial version', async () => {
      const res = await fetch(`${base}/documents`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Policy', fileName: 'policy.pdf', fileSize: 1024, tags: ['policy'] }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.title).toBe('New Policy');
      expect(data.version).toBe(1);
    });
  });

  describe('GET /documents/:id/versions', () => {
    it('returns version history', async () => {
      const res = await fetch(`${base}/documents/doc-1/versions`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /documents/stats/summary', () => {
    it('returns document stats', async () => {
      const res = await fetch(`${base}/documents/stats/summary`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalDocuments).toBeGreaterThanOrEqual(1);
      expect(data.totalSizeBytes).toBeGreaterThan(0);
    });
  });
});
