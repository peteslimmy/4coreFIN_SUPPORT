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
    major_incidents: [], customers: [], app_config: [], sla_rules: [], holidays: [],
    ticket_templates: [], kb_articles: [],
    'documents.document_folders': [],
    'documents.document_registry': [],
    'documents.document_versions': [],
    'documents.document_permissions': [],
    'analytics.sla_daily_snapshot': [
      { id: 'sla-1', snapshot_date: '2026-08-20', breached_count: 5, at_risk_count: 3, avg_resolution_hours: '4.5', tenant_id: ALPHA },
      { id: 'sla-2', snapshot_date: '2026-08-21', breached_count: 2, at_risk_count: 1, avg_resolution_hours: '3.2', tenant_id: ALPHA },
    ],
    'analytics.ticket_daily_snapshot': [
      { id: 'td-1', snapshot_date: '2026-08-20', created_count: 10, resolved_count: 7, closed_count: 5, avg_first_response_hours: '1.5', avg_resolution_hours: '4.0', tenant_id: ALPHA },
      { id: 'td-2', snapshot_date: '2026-08-21', created_count: 8, resolved_count: 8, closed_count: 6, avg_first_response_hours: '1.2', avg_resolution_hours: '3.0', tenant_id: ALPHA },
    ],
    'analytics.partner_daily_snapshot': [
      { id: 'pd-1', snapshot_date: '2026-08-20', partner_name: 'PartnerA', total_tickets: 12, resolved_count: 9, breached_count: 2, avg_resolution_hours: '5.0', tenant_id: ALPHA },
      { id: 'pd-2', snapshot_date: '2026-08-21', partner_name: 'PartnerA', total_tickets: 10, resolved_count: 8, breached_count: 1, avg_resolution_hours: '4.0', tenant_id: ALPHA },
      { id: 'pd-3', snapshot_date: '2026-08-20', partner_name: 'PartnerB', total_tickets: 6, resolved_count: 4, breached_count: 0, avg_resolution_hours: '3.5', tenant_id: ALPHA },
    ],
    'search.search_log': [],
    'search.search_shortcuts': [],
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

describe('Analytics domain', () => {
  let adminSession: Session;
  beforeEach(async () => { adminSession = await login('admin@4core.com'); });

  describe('GET /analytics/sla', () => {
    it('returns aggregated SLA data', async () => {
      const res = await fetch(`${base}/analytics/sla`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.period).toBeDefined();
      expect(typeof data.totalBreached).toBe('number');
      expect(typeof data.totalAtRisk).toBe('number');
      expect(typeof data.avgResolutionHours).toBe('number');
      expect(Array.isArray(data.dailySnapshots)).toBe(true);
      expect(data.totalBreached).toBe(7);
      expect(data.totalAtRisk).toBe(4);
      expect(data.avgResolutionHours).toBe(3.85);
      expect(data.dailySnapshots.length).toBe(2);
    });

    it('respects days param', async () => {
      const res = await fetch(`${base}/analytics/sla?days=1`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.period.days).toBe(1);
      expect(data.dailySnapshots.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /analytics/tickets', () => {
    it('returns aggregated ticket flow data', async () => {
      const res = await fetch(`${base}/analytics/tickets`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.totalCreated).toBe('number');
      expect(typeof data.totalResolved).toBe('number');
      expect(typeof data.totalClosed).toBe('number');
      expect(typeof data.resolutionRate).toBe('number');
      expect(typeof data.avgFirstResponseHours).toBe('number');
      expect(Array.isArray(data.dailySnapshots)).toBe(true);
      expect(data.totalCreated).toBe(18);
      expect(data.totalResolved).toBe(15);
      expect(data.totalClosed).toBe(11);
      expect(data.resolutionRate).toBe(83);
      expect(data.dailySnapshots.length).toBe(2);
    });
  });

  describe('GET /analytics/partners', () => {
    it('returns per-partner breakdown', async () => {
      const res = await fetch(`${base}/analytics/partners`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.period).toBeDefined();
      expect(typeof data.partners).toBe('object');
      expect(Array.isArray(data.dailySnapshots)).toBe(true);
      expect(data.partners.PartnerA).toBeDefined();
      expect(data.partners.PartnerA.totalTickets).toBe(22);
      expect(data.partners.PartnerA.resolvedCount).toBe(17);
      expect(data.partners.PartnerB).toBeDefined();
      expect(data.partners.PartnerB.totalTickets).toBe(6);
      expect(data.partners.PartnerB.breachedCount).toBe(0);
      expect(data.dailySnapshots.length).toBe(3);
    });
  });

  describe('GET /analytics/snapshot/status', () => {
    it('returns latestSnapshot date', async () => {
      const res = await fetch(`${base}/analytics/snapshot/status`, { headers: authedHeaders(adminSession) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.latestSnapshot).toBe('2026-08-21');
    });
  });

  describe('auth required', () => {
    it('GET /analytics/sla returns 401 without session', async () => {
      const res = await fetch(`${base}/analytics/sla`);
      expect(res.status).toBe(401);
    });

    it('GET /analytics/tickets returns 401 without session', async () => {
      const res = await fetch(`${base}/analytics/tickets`);
      expect(res.status).toBe(401);
    });

    it('GET /analytics/partners returns 401 without session', async () => {
      const res = await fetch(`${base}/analytics/partners`);
      expect(res.status).toBe(401);
    });

    it('GET /analytics/snapshot/status returns 401 without session', async () => {
      const res = await fetch(`${base}/analytics/snapshot/status`);
      expect(res.status).toBe(401);
    });
  });
});
