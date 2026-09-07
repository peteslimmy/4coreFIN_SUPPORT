/**
 * Security regression — ticket mutation hardening (Next.js port).
 *
 * Covers the audit fixes applied during the migration, exercised through the
 * real Next.js route handlers:
 *   - PARTNER field-level allowlist on PATCH (403, denied fields listed)
 *   - masked-PII round-trip rejection (400)
 *   - escalation is permission-gated + reason-mandated, server-derived audit
 *   - optimistic concurrency (409 CONCURRENT_MODIFICATION) on PATCH, DELETE
 *     and feedback under a simulated concurrent writer
 *   - feedback restricted to resolved/closed tickets and own-BU customers
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'regression-jwt-secret';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);
});

vi.mock('../../../server/supabase', () => {
  const s = { from: () => { throw new Error('not initialised'); } };
  return { supabase: s, supabaseAuth: s };
});
vi.mock('../../../server/supabaseAdmin', () => {
  const s = { from: () => { throw new Error('not initialised'); } };
  return { supabaseAdmin: s };
});
vi.mock('../../../server/broadcast', () => ({ broadcast: vi.fn() }));
vi.mock('../../../server/services/notifyEmails', () => ({ notifyByEmail: vi.fn(), appHomeUrl: () => 'http://localhost' }));
vi.mock('../../../server/services/webhookDispatcher', () => ({ dispatchWebhook: vi.fn(async () => {}) }));

import { PATCH, DELETE } from '../../app/api/tickets/[id]/route';
import { PATCH as FEEDBACK_PATCH } from '../../app/api/tickets/[id]/feedback/route';
import {
  seedStore,
  seedTicket,
  installFakeSupabase,
  authedRequest,
  makeUserRow,
  interceptTicketUpdatesWithVersionBump,
} from './helpers';
import type { TableStore } from '../../../tests/helpers/fakeSupabase';

let store: TableStore;

beforeEach(() => {
  store = installFakeSupabase(seedStore());
  store.users = [
    makeUserRow(),
    makeUserRow({ id: 'usr-l2', name: 'Agent Two', email: 'l2@4core.com', role: 'BU_SUPPORT_L2' }),
    makeUserRow({ id: 'usr-l3', name: 'Agent Three', email: 'l3@4core.com', role: 'BU_SUPPORT_L3' }),
    makeUserRow({ id: 'usr-partner', name: 'Pat Partner', email: 'pat@parkway.com', role: 'PARTNER', bu: 'Parkway', partner: 'Parkway' }),
    makeUserRow({ id: 'usr-cust', name: 'Cara Customer', email: 'cara@acme.com', role: 'CUSTOMER', bu: 'BU-A' }),
  ];
  store.customers = [];
  store.audit_logs = [];
});

const L1 = {}; // default user in helpers is BU_SUPPORT_L1
const L2 = { id: 'usr-l2', name: 'Agent Two', email: 'l2@4core.com', role: 'BU_SUPPORT_L2' };
const L3 = { id: 'usr-l3', name: 'Agent Three', email: 'l3@4core.com', role: 'BU_SUPPORT_L3' };
const PARTNER = { id: 'usr-partner', name: 'Pat Partner', email: 'pat@parkway.com', role: 'PARTNER', bu: 'Parkway', partner: 'Parkway' };
const CUSTOMER = { id: 'usr-cust', name: 'Cara Customer', email: 'cara@acme.com', role: 'CUSTOMER', bu: 'BU-A' };

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/tickets/[id] — field-level allowlist', () => {
  it('rejects a PARTNER patching BU-side fields (customerEmail, amount, transactionId)', async () => {
    store.tickets = [seedTicket({ partner: 'Parkway' })];
    const req = authedRequest('/api/tickets/tkt-1', PARTNER, {
      method: 'PATCH',
      body: { customerEmail: 'new@acme.com', amount: 99999, transactionId: 'STOLEN' },
    });
    const res = await PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Partners may only update case-handling fields');
    expect(body.error).toContain('customerEmail');
    expect(body.error).toContain('amount');
    expect(body.error).toContain('transactionId');
  });

  it('allows a PARTNER to patch RCA case-handling fields', async () => {
    store.tickets = [seedTicket({ partner: 'Parkway' })];
    const req = authedRequest('/api/tickets/tkt-1', PARTNER, {
      method: 'PATCH',
      body: { rootCause: 'Gateway timeout confirmed by provider' },
    });
    const res = await PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/tickets/[id] — masked-PII round-trip rejection', () => {
  it('rejects saving a masked customerEmail back onto the ticket', async () => {
    const req = authedRequest('/api/tickets/tkt-1', L1, {
      method: 'PATCH',
      body: { customerEmail: 'j•••@acme.com' },
    });
    const res = await PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Cannot save masked value for customerEmail');
  });

  it('rejects masked values in any PII field (transactionId)', async () => {
    const req = authedRequest('/api/tickets/tkt-1', L1, {
      method: 'PATCH',
      body: { transactionId: 'TX-••••12' },
    });
    const res = await PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('transactionId');
  });
});

describe('PATCH /api/tickets/[id] — escalation hardening', () => {
  it('rejects escalation from a role without tickets:escalate (L1)', async () => {
    const req = authedRequest('/api/tickets/tkt-1', L1, {
      method: 'PATCH',
      body: { isEscalated: true, escalationReason: 'Customer confirms funds lost in transit' },
    });
    const res = await PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Requires permission: tickets:escalate');
  });

  it('rejects escalation without the mandatory reason (min 10 chars)', async () => {
    const req = authedRequest('/api/tickets/tkt-1', L2, {
      method: 'PATCH',
      body: { isEscalated: true, escalationReason: 'urgent' },
    });
    const res = await PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('mandatory escalation reason');
  });

  it('applies a valid escalation: bumps count, stamps actor, writes server-side audit', async () => {
    const req = authedRequest('/api/tickets/tkt-1', L2, {
      method: 'PATCH',
      body: { isEscalated: true, escalationReason: 'Customer confirms funds not received after 72 hours' },
    });
    const res = await PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isEscalated).toBe(true);
    expect(body.escalationCount).toBe(1);
    expect(body.escalatedBy).toBe('Agent Two');
    expect(typeof body.escalatedAt).toBe('string');

    // audit() is fire-and-forget; flush the queue before asserting.
    await new Promise((r) => setTimeout(r, 50));
    const auditRows = store.audit_logs as any[];
    const escalationAudit = auditRows.find((r) => r.action === 'TICKET_UPDATED' && String(r.details).includes('escalated by'));
    expect(escalationAudit).toBeTruthy();
    expect(escalationAudit.actor).toBe('Agent Two');
  });
});

describe('optimistic concurrency (409 CONCURRENT_MODIFICATION)', () => {
  let restore: () => void;

  afterEach(() => { restore?.(); restore = undefined as unknown as () => void; });

  it('PATCH answers 409 when the row version moved between read and write', async () => {
    restore = interceptTicketUpdatesWithVersionBump(store);
    const req = authedRequest('/api/tickets/tkt-1', L2, {
      method: 'PATCH',
      body: { description: 'updated description' },
    });
    const res = await PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('CONCURRENT_MODIFICATION');
  });

  it('DELETE answers 409 on a soft-delete race', async () => {
    restore = interceptTicketUpdatesWithVersionBump(store);
    const req = authedRequest('/api/tickets/tkt-1', L3, { method: 'DELETE' });
    const res = await DELETE(req, routeCtx('tkt-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('CONCURRENT_MODIFICATION');
  });

  it('feedback answers 409 on a concurrent write', async () => {
    restore = interceptTicketUpdatesWithVersionBump(store);
    store.tickets = [seedTicket({ status: 'RESOLVED' })];
    const req = authedRequest('/api/tickets/tkt-1/feedback', CUSTOMER, {
      method: 'PATCH',
      body: { feedbackScore: 5 },
    });
    const res = await FEEDBACK_PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('CONCURRENT_MODIFICATION');
  });
});

describe('DELETE /api/tickets/[id]', () => {
  it('rejects a role without tickets:delete (L1)', async () => {
    const req = authedRequest('/api/tickets/tkt-1', L1, { method: 'DELETE' });
    const res = await DELETE(req, routeCtx('tkt-1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Requires permission: tickets:delete');
  });

  it('soft-deletes with tickets:delete and does not hard-remove the row', async () => {
    const req = authedRequest('/api/tickets/tkt-1', L3, { method: 'DELETE' });
    const res = await DELETE(req, routeCtx('tkt-1'));
    expect(res.status).toBe(200);
    expect((store.tickets[0] as any).is_deleted).toBe(true);
    expect(store.tickets).toHaveLength(1);
  });
});

describe('PATCH /api/tickets/[id]/feedback', () => {
  it('rejects feedback while the ticket is not resolved or closed', async () => {
    const req = authedRequest('/api/tickets/tkt-1/feedback', CUSTOMER, {
      method: 'PATCH',
      body: { feedbackScore: 4 },
    });
    const res = await FEEDBACK_PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('resolved or closed');
  });

  it('hides tickets outside the customer business unit (404, no existence leak)', async () => {
    store.tickets = [seedTicket({ status: 'RESOLVED', business_unit: 'BU-OTHER' })];
    const req = authedRequest('/api/tickets/tkt-1/feedback', CUSTOMER, {
      method: 'PATCH',
      body: { feedbackScore: 4 },
    });
    const res = await FEEDBACK_PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(404);
  });

  it('accepts feedback from a CUSTOMER on their own BU ticket', async () => {
    store.tickets = [seedTicket({ status: 'RESOLVED' })];
    const req = authedRequest('/api/tickets/tkt-1/feedback', CUSTOMER, {
      method: 'PATCH',
      body: { feedbackScore: 5, feedbackComment: 'Resolved quickly' },
    });
    const res = await FEEDBACK_PATCH(req, routeCtx('tkt-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feedbackScore).toBe(5);
  });
});
