import { describe, it, expect } from 'vitest';
import {
  TICKET_STATUS_ORDER,
  applyTransition,
  canTransition,
  getAvailableTransitions,
  getTicketStatusStep,
  getAllTransitionBlockers,
  getTransitionBlockers,
  isTerminal,
  TransitionError,
} from './ticketStateMachine';
import { TicketStatus, UserRole, type TicketRecord } from '../types/app';

const baseTicket = (over: Partial<TicketRecord> = {}): TicketRecord => ({
  id: 'TKT-TEST',
  customerName: 'Ada',
  customerEmail: 'ada@4core.com',
  businessUnit: 'General',
  partner: 'Parkway',
  category: 'Duplicate Debit',
  priority: 'MEDIUM' as TicketRecord['priority'],
  status: TicketStatus.RECEIPT,
  amount: 50000,
  transactionId: 'TXN-1',
  description: 'double debit',
  createdAt: new Date().toISOString(),
  slaDeadline: new Date(Date.now() + 24 * 3600000).toISOString(),
  isEscalated: false,
  escalationCount: 0,
  assignedAgentId: 'agent-1',
  majorIncidentId: null,
  feedbackScore: null,
  feedbackComment: null,
  submittedBy: 'BU_SUPPORT',
  ...over,
});

const fullRcaTicket = (over: Partial<TicketRecord> = {}): TicketRecord =>
  baseTicket({
    status: TicketStatus.INVESTIGATE,
    rcaDetails: {
      rootCause: 'bad ledger entry',
      contributingFactors: 'weekend close',
      correctiveActions: 'reprocess',
      preventiveActions: 'reconcile weekly',
      preventiveOwner: 'Ops',
      preventiveDueDate: new Date().toISOString(),
    },
    ...over,
  });

describe('ticketStateMachine', () => {
  it('exposes a canonical status ordering that matches the wizard', () => {
    expect(TICKET_STATUS_ORDER).toEqual([
      TicketStatus.RECEIPT,
      TicketStatus.ASSIGNED,
      TicketStatus.INVESTIGATE,
      TicketStatus.RESOLVED,
      TicketStatus.CLOSED,
    ]);
  });

  it('getTicketStatusStep maps each status to its ordinal, unknown -> 0', () => {
    expect(getTicketStatusStep(TicketStatus.RECEIPT)).toBe(0);
    expect(getTicketStatusStep(TicketStatus.ASSIGNED)).toBe(1);
    expect(getTicketStatusStep(TicketStatus.INVESTIGATE)).toBe(2);
    expect(getTicketStatusStep(TicketStatus.RESOLVED)).toBe(3);
    expect(getTicketStatusStep(TicketStatus.CLOSED)).toBe(4);
    expect(getTicketStatusStep('BOGUS')).toBe(0);
  });

  it('CLOSED is terminal', () => {
    expect(isTerminal(TicketStatus.CLOSED)).toBe(true);
    expect(isTerminal(TicketStatus.RESOLVED)).toBe(false);
  });

  it('only allows role-scoped transitions', () => {
    const t = baseTicket({ status: TicketStatus.RECEIPT, assignedAgentId: '' });
    expect(getAvailableTransitions(t, UserRole.PARTNER)).toHaveLength(0);
    expect(
      getAvailableTransitions(baseTicket({ status: TicketStatus.RECEIPT }), UserRole.BU_SUPPORT).some(
        r => r.to === TicketStatus.ASSIGNED
      )
    ).toBe(true);
  });

  it('beginInvestigation requires an assigned agent', () => {
    const unassigned = baseTicket({ status: TicketStatus.ASSIGNED, assignedAgentId: '' });
    const assigned = baseTicket({ status: TicketStatus.ASSIGNED, assignedAgentId: 'a-1' });
    expect(
      getAvailableTransitions(unassigned, UserRole.PARTNER).some(r => r.to === TicketStatus.INVESTIGATE)
    ).toBe(false);
    expect(
      getAvailableTransitions(assigned, UserRole.PARTNER).some(r => r.to === TicketStatus.INVESTIGATE)
    ).toBe(true);
  });

  it('resolve is role-allowed but blocked by incomplete RCA', () => {
    const incomplete = baseTicket({ status: TicketStatus.INVESTIGATE });
    // PARTNER is permitted to resolve by role...
    expect(canTransition(incomplete, TicketStatus.RESOLVED, UserRole.PARTNER)).toBe(true);
    // ...but the data is incomplete, so applying it throws REQUIRES_FIELDS.
    expect(incomplete.rcaDetails).toBeFalsy();
    expect(() => applyTransition(incomplete, TicketStatus.RESOLVED, UserRole.PARTNER)).toThrow(
      TransitionError
    );
    try {
      applyTransition(incomplete, TicketStatus.RESOLVED, UserRole.PARTNER);
    } catch (e) {
      expect((e as TransitionError).code).toBe('REQUIRES_FIELDS');
    }

    const complete = fullRcaTicket();
    expect(canTransition(complete, TicketStatus.RESOLVED, UserRole.PARTNER)).toBe(true);
    const resolved = applyTransition(complete, TicketStatus.RESOLVED, UserRole.PARTNER);
    expect(resolved.status).toBe(TicketStatus.RESOLVED);
    expect(resolved.rcaDetails?.resolvedAt).toBeTruthy();
  });

  it('close is role-allowed but blocked when feedback is missing', () => {
    const resolvedNoFeedback = fullRcaTicket({ status: TicketStatus.RESOLVED, feedbackScore: null });
    expect(canTransition(resolvedNoFeedback, TicketStatus.CLOSED, UserRole.BU_SUPPORT)).toBe(true);
    expect(() => applyTransition(resolvedNoFeedback, TicketStatus.CLOSED, UserRole.BU_SUPPORT)).toThrow(
      TransitionError
    );
    try {
      applyTransition(resolvedNoFeedback, TicketStatus.CLOSED, UserRole.BU_SUPPORT);
    } catch (e) {
      expect((e as TransitionError).code).toBe('REQUIRES_FIELDS');
    }

    const withFeedback = fullRcaTicket({ status: TicketStatus.RESOLVED, feedbackScore: 5 });
    expect(canTransition(withFeedback, TicketStatus.CLOSED, UserRole.BU_SUPPORT)).toBe(true);
    expect(
      applyTransition(withFeedback, TicketStatus.CLOSED, UserRole.BU_SUPPORT).status
    ).toBe(TicketStatus.CLOSED);
  });

  it('partners cannot close directly', () => {
    const withFeedback = fullRcaTicket({ status: TicketStatus.RESOLVED, feedbackScore: 4 });
    expect(canTransition(withFeedback, TicketStatus.CLOSED, UserRole.PARTNER)).toBe(false);
  });

  it('reject-and-reopen escalates the ticket', () => {
    const resolved = fullRcaTicket({ status: TicketStatus.RESOLVED, feedbackScore: null });
    const reopened = applyTransition(resolved, TicketStatus.INVESTIGATE, UserRole.BU_SUPPORT);
    expect(reopened.status).toBe(TicketStatus.INVESTIGATE);
    expect(reopened.isEscalated).toBe(true);
    expect(reopened.escalationCount).toBe(1);
  });

it('reopen is allowed from CLOSED to REOPENED', () => {
    const closed = fullRcaTicket({ status: TicketStatus.CLOSED, feedbackScore: 5 });
    expect(canTransition(closed, TicketStatus.REOPENED, UserRole.BU_SUPPORT)).toBe(true);
});

  it('merge-close is allowed from active states', () => {
    for (const s of [
      TicketStatus.RECEIPT,
      TicketStatus.ASSIGNED,
      TicketStatus.INVESTIGATE,
      TicketStatus.RESOLVED,
    ]) {
      expect(
        canTransition(baseTicket({ status: s }), TicketStatus.CLOSED, UserRole.BU_SUPPORT)
      ).toBe(true);
    }
  });

  it('throws TransitionError (NOT_ALLOWED) for forbidden transitions', () => {
    const t = baseTicket({ status: TicketStatus.CLOSED });
    expect(() => applyTransition(t, TicketStatus.ASSIGNED, UserRole.BU_SUPPORT)).toThrow(
      TransitionError
    );
    try {
      applyTransition(t, TicketStatus.ASSIGNED, UserRole.BU_SUPPORT);
    } catch (e) {
      const err = e as TransitionError;
      expect(err.code).toBe('NOT_ALLOWED');
      // Other transitions (Reopen, Mark Merged) remain valid from CLOSED.
      expect(err.allowed.map(a => a.to)).not.toContain(TicketStatus.ASSIGNED);
    }
  });

  it('throws TransitionError (REQUIRES_FIELDS) when RCA is incomplete', () => {
    const incomplete = baseTicket({ status: TicketStatus.INVESTIGATE });
    expect(() =>
      applyTransition(incomplete, TicketStatus.RESOLVED, UserRole.PARTNER)
    ).toThrow(TransitionError);
    try {
      applyTransition(incomplete, TicketStatus.RESOLVED, UserRole.PARTNER);
    } catch (e) {
      expect((e as TransitionError).code).toBe('REQUIRES_FIELDS');
    }
  });

  it('getTransitionBlockers reports the missing required fields with labels', () => {
    const incomplete = baseTicket({ status: TicketStatus.INVESTIGATE });
    const rule = getAvailableTransitions(incomplete, UserRole.PARTNER).find(
      r => r.to === TicketStatus.RESOLVED
    );
    expect(rule).toBeTruthy();
    expect(getTransitionBlockers(incomplete, rule!)).toEqual(
      expect.arrayContaining(['Root Cause', 'Corrective Actions', 'Preventive Actions'])
    );

    const complete = fullRcaTicket();
    expect(getTransitionBlockers(complete, rule!)).toHaveLength(0);
  });

  it('close surfaces the missing feedback requirement', () => {
    const resolvedNoFeedback = fullRcaTicket({ status: TicketStatus.RESOLVED, feedbackScore: null });
    const closeRule = getAvailableTransitions(resolvedNoFeedback, UserRole.BU_SUPPORT).find(
      r => r.to === TicketStatus.CLOSED
    );
    expect(getTransitionBlockers(resolvedNoFeedback, closeRule!)).toContain('Customer feedback score');
  });

  it('getAllTransitionBlockers unions blockers across the role accessible rules', () => {
    const incomplete = baseTicket({ status: TicketStatus.INVESTIGATE });
    const blockers = getAllTransitionBlockers(incomplete, UserRole.PARTNER);
    expect(blockers).toContain('Root Cause');
    expect(blockers).toContain('Corrective Actions');
    expect(new Set(blockers).size).toBe(blockers.length);

    expect(getAllTransitionBlockers(fullRcaTicket(), UserRole.PARTNER)).toHaveLength(0);
  });
});

describe('waiting-state lifecycle and SLA pause', () => {
  const investigating = baseTicket({ status: TicketStatus.INVESTIGATE, assignedAgentId: 'agent-1' });

  it('enters waiting states from INVESTIGATE and starts the pause clock', () => {
    const before = Date.now();
    const waiting = applyTransition(investigating, TicketStatus.WAITING_PARTNER, UserRole.BU_SUPPORT);
    expect(waiting.status).toBe(TicketStatus.WAITING_PARTNER);
    expect(waiting.slaPauseStartedAt).toBeTruthy();
    expect(new Date(waiting.slaPauseStartedAt!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('accumulates paused time when the wait ends', async () => {
    const started = new Date(Date.now() - 3600_000).toISOString(); // waited 1h
    const waiting = { ...investigating, status: TicketStatus.WAITING_PARTNER, slaPauseStartedAt: started, slaPausedMs: 0 } as TicketRecord;
    const resumed = applyTransition(waiting, TicketStatus.INVESTIGATE, UserRole.PARTNER);
    expect(resumed.status).toBe(TicketStatus.INVESTIGATE);
    expect(resumed.slaPauseStartedAt).toBeNull();
    expect(resumed.slaPausedMs!).toBeGreaterThanOrEqual(3600_000);
    expect(resumed.slaPausedMs!).toBeLessThan(3700_000);
  });

  it('partners can resume a WAITING_PARTNER ticket; customers cannot', () => {
    const waiting = { ...investigating, status: TicketStatus.WAITING_PARTNER } as TicketRecord;
    expect(getAvailableTransitions(waiting, UserRole.PARTNER).map(r => r.to)).toContain(TicketStatus.INVESTIGATE);
    expect(getAvailableTransitions(waiting, UserRole.CUSTOMER as UserRole)).toEqual([]);
  });

  it('only investigators can enter a customer/internal hold; BU support routes to partner', () => {
    expect(getAvailableTransitions(investigating, UserRole.PARTNER).map(r => r.to)).toContain(TicketStatus.WAITING_CUSTOMER);
    expect(getAvailableTransitions(investigating, UserRole.BU_SUPPORT_L1).map(r => r.to)).not.toContain(TicketStatus.WAITING_CUSTOMER);
    // BU support may still route a case to the partner desk without investigating.
    expect(getAvailableTransitions(investigating, UserRole.BU_SUPPORT_L1).map(r => r.to)).toContain(TicketStatus.WAITING_PARTNER);
  });

  it('BU support cannot begin an investigation; partner support can', () => {
    const assigned = baseTicket({ status: TicketStatus.ASSIGNED, assignedAgentId: 'a-1' });
    for (const bu of [UserRole.BU_SUPPORT, UserRole.BU_SUPPORT_L1, UserRole.BU_SUPPORT_L2, UserRole.BU_SUPPORT_L3]) {
      expect(getAvailableTransitions(assigned, bu).map(r => r.to)).not.toContain(TicketStatus.INVESTIGATE);
      expect(canTransition(assigned, TicketStatus.INVESTIGATE, bu)).toBe(false);
    }
    expect(getAvailableTransitions(assigned, UserRole.PARTNER).map(r => r.to)).toContain(TicketStatus.INVESTIGATE);
    expect(getAvailableTransitions(assigned, UserRole.SUPER_ADMIN).map(r => r.to)).toContain(TicketStatus.INVESTIGATE);
  });

  it('BU support retains full lifecycle outside investigation', () => {
    const assigned = baseTicket({ status: TicketStatus.ASSIGNED });
    // Assign from receipt
    expect(getAvailableTransitions(baseTicket({ status: TicketStatus.RECEIPT }), UserRole.BU_SUPPORT).some(r => r.to === TicketStatus.ASSIGNED)).toBe(true);
    // Reject & reopen a resolved ticket
    const resolved = fullRcaTicket({ status: TicketStatus.RESOLVED, feedbackScore: null });
    const reopened = applyTransition(resolved, TicketStatus.INVESTIGATE, UserRole.BU_SUPPORT_L2);
    expect(reopened.status).toBe(TicketStatus.INVESTIGATE);
    expect(reopened.isEscalated).toBe(true);
    void assigned;
  });

  it('partners can resume WAITING_CUSTOMER / WAITING_INTERNAL; BU cannot', () => {
    const waitCustomer = { ...investigating, status: TicketStatus.WAITING_CUSTOMER } as TicketRecord;
    const waitInternal = { ...investigating, status: TicketStatus.WAITING_INTERNAL } as TicketRecord;
    expect(getAvailableTransitions(waitCustomer, UserRole.PARTNER).map(r => r.to)).toContain(TicketStatus.INVESTIGATE);
    expect(getAvailableTransitions(waitCustomer, UserRole.BU_SUPPORT).map(r => r.to)).not.toContain(TicketStatus.INVESTIGATE);
    expect(getAvailableTransitions(waitInternal, UserRole.PARTNER).map(r => r.to)).toContain(TicketStatus.INVESTIGATE);
    expect(getAvailableTransitions(waitInternal, UserRole.BU_SUPPORT).map(r => r.to)).not.toContain(TicketStatus.INVESTIGATE);
  });

  it('waiting states share the In Review progress step', () => {
    expect(getTicketStatusStep(TicketStatus.WAITING_PARTNER)).toBe(getTicketStatusStep(TicketStatus.INVESTIGATE));
    expect(getTicketStatusStep(TicketStatus.WAITING_CUSTOMER)).toBe(2);
  });

  it('tickets can be merged closed straight from a waiting state', () => {
    const waiting = { ...investigating, status: TicketStatus.WAITING_INTERNAL, slaPauseStartedAt: new Date().toISOString() } as TicketRecord;
    const merged = applyTransition(waiting, TicketStatus.CLOSED, UserRole.BU_SUPPORT_L3);
    expect(merged.status).toBe(TicketStatus.CLOSED);
    expect(merged.slaPauseStartedAt).toBeNull();
  });
});
