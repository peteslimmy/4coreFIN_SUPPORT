import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import express from 'express';
import { createApiRouter } from '../server/routes';
import { requireCsrf } from '../server/auth';
import { resetDatabase } from './helpers/testDb';
import { createTestUser } from './helpers/testUsers';
import { insertRows, supabase } from './helpers/testDb';
import { ticketRow } from './helpers/testSeeds';
import './helpers/conftest';
import {
  nextStatuses,
  transitionBlocked,
  resolveRequires,
  closeRequires,
  normalizeStatus,
  severityJustificationRequired,
  isActiveStatus,
} from '../server/lib/majorIncidentStateMachine';

const ALPHA = 'tnt-ALPHA';
const PASSWORD = 'password123';

let base: string;
let server: Server | undefined;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', (req, res, next) => requireCsrf(req as any, res, next));
app.use('/api', createApiRouter());

interface Session {
  session: string;
  csrf: string;
}

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

const VALID_DECLARE = {
  name: 'Paystack Settlement Delay',
  description: 'Settlement callbacks failing with 504s.',
  severity: 'HIGH',
  affectedPartners: ['Paystack'],
  affectedBus: ['ALPHA'],
  severityJustification: 'Bulk settlement outages block payouts to merchants.',
};

beforeEach(async () => {
  await resetDatabase();
  await createTestUser({
    id: 'usr-l1',
    name: 'Liam L1',
    email: 'l1@alpha.com',
    password: PASSWORD,
    role: 'BU_SUPPORT_L1',
    bu: 'ALPHA',
    phone: '',
  });
  await createTestUser({
    id: 'usr-l3',
    name: 'Leah L3',
    email: 'l3@alpha.com',
    password: PASSWORD,
    role: 'BU_SUPPORT_L3',
    bu: 'ALPHA',
    phone: '',
  });
  await createTestUser({
    id: 'usr-partner',
    name: 'Pay Rep',
    email: 'rep@paystack.com',
    password: PASSWORD,
    role: 'PARTNER',
    bu: 'ALL',
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
  await insertRows('tickets', [
    {
      id: 'tkt-a1',
      business_unit: 'ALPHA',
      provider: 'Paystack',
      category: 'Payment Dispute',
      issue_type: 'Payment Dispute',
      priority: 'HIGH',
      status: 'INVESTIGATE',
      is_deleted: false,
      created_at: '2026-07-01T00:00:00Z',
      sla_deadline: '2026-07-10T00:00:00Z',
      customer_name: 'Faith',
      customer_email: 'faith@example.com',
      customer_phone: '',
      customer_last_name: '',
      customer_id: null,
      amount: 100,
      transaction_id: 'TX1',
      card_pan: '****',
      description: '',
      is_escalated: false,
      escalation_count: 0,
      assigned_agent_id: '',
      major_incident_id: null,
      watchers: [],
    },
  ]);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe('Major Incident state machine', () => {
  it('moves through the canonical lifecycle', () => {
    const declared = { status: 'DECLARED' };
    expect(nextStatuses(declared)).toEqual(['INVESTIGATING']);

    const investigating = { status: 'INVESTIGATING' };
    expect(nextStatuses(investigating)).toEqual(['IDENTIFIED', 'MONITORING', 'RESOLVED']);

    const monitoring = { status: 'MONITORING' };
    expect(nextStatuses(monitoring)).toEqual(['RESOLVED']);

    const resolved = { status: 'RESOLVED', pir: { draft: false } };
    expect(nextStatuses(resolved)).toEqual(['CLOSED', 'MONITORING']);

    expect(nextStatuses({ status: 'CLOSED' })).toEqual(['MONITORING']);
  });

  it('treats legacy MITIGATED as MONITORING', () => {
    expect(normalizeStatus('MITIGATED')).toBe('MONITORING');
    expect(isActiveStatus('MITIGATED')).toBe(true);
    expect(nextStatuses({ status: 'MITIGATED' })).toEqual(['RESOLVED']);
  });

  it('blocks skips and demands PIR content before RESOLVED/CLOSED', () => {
    const declared = { status: 'DECLARED', pir: { draft: true } } as any;
    expect(transitionBlocked(declared, 'CLOSED')).toMatch(/directly to CLOSED/);
    expect(transitionBlocked({ status: 'INVESTIGATING', pir: { draft: true } }, 'RESOLVED')).toMatch(/root cause/);
    expect(transitionBlocked({ status: 'RESOLVED', pir: { draft: true, rootCauseSummary: 'x', preventiveOwner: 'y' } }, 'CLOSED')).toMatch(/PIR/);
    expect(closeRequires({ status: 'INVESTIGATING', pir: { draft: true } })).toMatch(/RESOLVED before closing/);
  });

  it('allows RESOLVED once root cause + preventive owner are set, then CLOSED after finalize', () => {
    const pir = { rootCauseSummary: 'Buffer leak', preventiveOwner: 'Platform Team', draft: false };
    expect(resolveRequires({ status: 'INVESTIGATING', pir })).toBeNull();
    expect(transitionBlocked({ status: 'MONITORING', pir }, 'RESOLVED')).toBeNull();
    expect(transitionBlocked({ status: 'RESOLVED', pir }, 'CLOSED')).toBeNull();
  });

  it('requires severity justification for CRITICAL declarations', () => {
    expect(severityJustificationRequired('CRITICAL')).toBe(true);
    expect(severityJustificationRequired('HIGH')).toBe(false);
  });
});

describe('Declaring a major incident', () => {
  it('requires the declare permission (BU_SUPPORT_L1 is denied)', async () => {
    const s = await login('l1@alpha.com');
    const res = await fetch(`${base}/major-incidents`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_DECLARE),
    });
    expect(res.status).toBe(403);
  });

  it('lets BU_SUPPORT_L3 and PARTNER declare', async () => {
    for (const email of ['l3@alpha.com', 'rep@paystack.com']) {
      const s = await login(email);
      const res = await fetch(`${base}/major-incidents`, {
        method: 'POST',
        headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_DECLARE),
      });
      expect(res.status).toBe(201);
      const mi = (await res.json()) as any;
      expect(mi.status).toBe('DECLARED');
      expect(mi.timeline.length).toBe(1);
      expect(mi.declaredBy.name).toBeTruthy();
      expect(mi.notifications.length).toBe(1);
      expect(['SENT', 'FAILED', 'QUEUED']).toContain(mi.notifications[0].status);
    }
  });

  it('rejects a CRITICAL declaration missing its justification', async () => {
    const s = await login('l3@alpha.com');
    const res = await fetch(`${base}/major-incidents`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_DECLARE, severity: 'CRITICAL', severityJustification: '' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toMatch(/justification/i);
  });

  it('requires a name and description', async () => {
    const s = await login('l3@alpha.com');
    const res = await fetch(`${base}/major-incidents`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_DECLARE, name: '', description: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('links and upgrades the ticket to CRITICAL when declared severe', async () => {
    const s = await login('l3@alpha.com');
    const res = await fetch(`${base}/major-incidents`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_DECLARE, severity: 'CRITICAL', severityJustification: 'widespread', links: ['tkt-a1'] }),
    });
    expect(res.status).toBe(201);
    const { data } = await supabase.from('tickets').select('*').eq('id', 'tkt-a1');
    expect(data![0].major_incident_id).toBeTruthy();
    expect(data![0].priority).toBe('CRITICAL');
  });

  it('does not upgrade linked ticket priority for a non-severe declaration', async () => {
    const s = await login('l3@alpha.com');
    const res = await fetch(`${base}/major-incidents`, {
      method: 'POST',
      headers: { ...authedHeaders(s), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_DECLARE, links: ['tkt-a1'] }),
    });
    expect(res.status).toBe(201);
    const { data } = await supabase.from('tickets').select('*').eq('id', 'tkt-a1');
    expect(data![0].major_incident_id).toBeTruthy();
    expect(data![0].priority).toBe('HIGH');
  });
});

describe('Major Incident lifecycle enforcement', () => {
  let session: Session;
  let miId: string;

  beforeEach(async () => {
    session = await login('l3@alpha.com');
    const res = await fetch(`${base}/major-incidents`, {
      method: 'POST',
      headers: { ...authedHeaders(session), 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_DECLARE),
    });
    miId = ((await res.json()) as any).id;
  });

  const mutate = (patch: Record<string, unknown>) => fetch(`${base}/major-incidents/${miId}`, {
    method: 'PATCH',
    headers: { ...authedHeaders(session), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

  it('acknowledges DECLARED → INVESTIGATING and assigns an owner', async () => {
    const res = await mutate({ status: 'INVESTIGATING' });
    expect(res.status).toBe(200);
    const mi = (await res.json()) as any;
    expect(mi.status).toBe('INVESTIGATING');
    expect(mi.owner.name).toBe('Leah L3');
    expect(mi.acknowledgedAt).toBeTruthy();
    expect(mi.timeline.length).toBe(2);
  });

  it('blocks skipping over the lifecycle (DECLARED → CLOSED)', async () => {
    const res = await mutate({ status: 'CLOSED' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toMatch(/directly to CLOSED/);
  });

  it('blocks RESOLVED until root cause + preventive owner exist', async () => {
    await mutate({ status: 'INVESTIGATING' });
    const res = await mutate({ status: 'RESOLVED' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toMatch(/root cause/i);
  });

  it('allows RESOLVED with a valid PIR and records resolvedAt', async () => {
    await mutate({ status: 'INVESTIGATING' });
    await mutate({ status: 'MONITORING' });
    const res = await mutate({
      status: 'RESOLVED',
      pir: { rootCauseSummary: 'Buffer leak', timelineSummary: '14:02 detected', impactSummary: '142 checkouts', preventiveOwner: 'Platform Team', preventiveDueDate: '2026-08-01', draft: true },
    });
    expect(res.status).toBe(200);
    const mi = (await res.json()) as any;
    expect(mi.status).toBe('RESOLVED');
    expect(mi.resolvedAt).toBeTruthy();
  });

  it('rejects CLOSED before the PIR is finalized', async () => {
    await mutate({ status: 'INVESTIGATING' });
    await mutate({ status: 'MONITORING' });
    await mutate({ status: 'RESOLVED', pir: { rootCauseSummary: 'Buffer leak', preventiveOwner: 'Platform Team', draft: true } });
    const res = await mutate({ status: 'CLOSED' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toMatch(/PIR/i);
  });

  it('finalizes the PIR and closes in one guarded request', async () => {
    await mutate({ status: 'INVESTIGATING' });
    await mutate({ status: 'MONITORING' });
    await mutate({ status: 'RESOLVED', pir: { rootCauseSummary: 'Buffer leak', preventiveOwner: 'Platform Team', draft: false } });
    const res = await mutate({ status: 'CLOSED' });
    expect(res.status).toBe(200);
    const mi = (await res.json()) as any;
    expect(mi.status).toBe('CLOSED');
    expect(mi.active).toBe(false);
    expect(mi.closedAt).toBeTruthy();
    expect(mi.notifications.some((n: any) => n.status === 'SENT' || n.status === 'QUEUED' || n.status === 'FAILED')).toBe(true);
  });

  it('allows a legacy MITIGATED incident to move to RESOLVED with the alias', async () => {
    const { data } = await supabase.from('major_incidents').select('*').eq('id', miId);
    (data as any[])[0].status = 'MITIGATED';
    const res = await mutate({
      status: 'RESOLVED',
      pir: { rootCauseSummary: 'Root cause X', preventiveOwner: 'Team Y', draft: false },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).status).toBe('RESOLVED');
  });
});