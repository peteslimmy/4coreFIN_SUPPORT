import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

vi.mock('../../server/supabase', () => {
  const s = { from: () => { throw new Error('not initialised'); } };
  return { supabase: s, supabaseAuth: s };
});

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn().mockResolvedValue({ text: 'Mocked AI response' }),
}));

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mockGenerateContent };
    constructor(_opts: any) {}
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: { OBJECT: 'OBJECT', STRING: 'STRING' },
  };
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
    'analytics.sla_daily_snapshot': [],
    'analytics.ticket_daily_snapshot': [],
    'analytics.partner_daily_snapshot': [],
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

function authedHeaders(s: Session): Record<string, string> {
  const headers: Record<string, string> = { Cookie: `${s.session}; ${s.csrf}` };
  if (s.csrf) headers['X-CSRF-Token'] = s.csrf.split('=')[1];
  return headers;
}

beforeEach(async () => {
  mockGenerateContent.mockClear();
  mockGenerateContent.mockResolvedValue({ text: 'Mocked AI response' });

  const store = seedStore();
  Object.assign(supabase, createFakeSupabase(store));
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(() => { server?.close(); });

describe('AI Copilot', () => {
  let adminSession: Session;
  beforeEach(async () => { adminSession = await login('admin@4core.com'); });

  describe('POST /gemini/analyze', () => {
    it('returns AI analysis for a valid prompt', async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: 'Analysis: The payment flow is healthy.' });

      const res = await fetch(`${base}/gemini/analyze`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Analyze the current ticket trends' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.text).toBe('Analysis: The payment flow is healthy.');
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('rejects empty prompt', async () => {
      const res = await fetch(`${base}/gemini/analyze`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 500 when AI call fails', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API unavailable'));

      const res = await fetch(`${base}/gemini/analyze`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Analyze this' }),
      });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('requires authentication', async () => {
      const res = await fetch(`${base}/gemini/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Analyze this' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /gemini/classify', () => {
    it('returns classified data for a valid description', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          category: 'Duplicate Debit',
          issueType: 'Double Charge',
          priority: 'HIGH',
          provider: 'Parkway',
          reasoning: 'Customer reported duplicate debit.',
        }),
      });

      const res = await fetch(`${base}/gemini/classify`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Customer charged twice for the same transaction',
          categories: { 'Duplicate Debit': ['Double Charge', 'Repeated Transaction'] },
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.category).toBe('Duplicate Debit');
      expect(data.data.provider).toBe('Parkway');
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('rejects empty description', async () => {
      const res = await fetch(`${base}/gemini/classify`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: '', categories: {} }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 500 when AI call fails', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Classification service down'));

      const res = await fetch(`${base}/gemini/classify`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Payment stuck in pending',
          categories: { 'Settlement Delay': ['Pending Settlement'] },
        }),
      });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('POST /gemini/rca', () => {
    it('returns structured RCA data', async () => {
      const rcaResult = {
        rootCauseSummary: 'Network timeout during settlement',
        contributingFactors: 'High traffic volume, network congestion',
        correctiveActions: 'Restarted settlement service',
        preventiveActions: 'Implement circuit breaker pattern',
        preventiveOwner: 'Platform Engineering',
        preventiveDueDate: '2026-09-05',
      };
      mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(rcaResult) });

      const res = await fetch(`${base}/gemini/rca`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketDetails: {
            id: 'TKT-001',
            category: 'Settlement',
            issueType: 'Delayed Settlement',
            partner: 'Parkway',
            bu: 'Payments',
            description: 'Settlement delayed by 48 hours for batch 2026-08-22',
          },
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.rootCauseSummary).toContain('Network timeout');
      expect(data.data.preventiveOwner).toBe('Platform Engineering');
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('rejects missing ticketDetails', async () => {
      const res = await fetch(`${base}/gemini/rca`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('returns 500 when AI call fails', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('RCA generation failed'));

      const res = await fetch(`${base}/gemini/rca`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketDetails: {
            id: 'TKT-002',
            category: 'Payment',
            issueType: 'Timeout',
            bu: 'Payments',
            description: 'Payment gateway timed out',
          },
        }),
      });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });

  describe('POST /gemini/chat', () => {
    it('returns chat response for a message', async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: 'How can I help you with the payment investigation?' });

      const res = await fetch(`${base}/gemini/chat`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Help me investigate TKT-001' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.text).toContain('payment investigation');
    });

    it('sends conversation history to AI', async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: 'Continuing from our previous discussion...' });

      const res = await fetch(`${base}/gemini/chat`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What about the settlement issue?',
          history: [
            { role: 'user', text: 'We have a payment delay' },
            { role: 'assistant', text: 'I can help investigate that.' },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.contents).toContain('User: We have a payment delay');
      expect(callArgs.contents).toContain('Assistant: I can help investigate that.');
      expect(callArgs.contents).toContain('User: What about the settlement issue?');
    });

    it('rejects empty message', async () => {
      const res = await fetch(`${base}/gemini/chat`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 500 when AI call fails', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Chat service unavailable'));

      const res = await fetch(`${base}/gemini/chat`, {
        method: 'POST',
        headers: { ...authedHeaders(adminSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
    });
  });
});
