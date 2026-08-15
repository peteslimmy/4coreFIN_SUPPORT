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
      TicketStatus.WAITING_CUSTOMER,
      TicketStatus.WAITING_PARTNER,
      TicketStatus.WAITING_INTERNAL,
      TicketStatus.RESOLVED,
      TicketStatus.CLOSED,
    ]);
  });

  it('getTicketStatusStep maps each status to its ordinal, unknown -> 0', () => {
    expect(getTicketStatusStep(TicketStatus.RECEIPT)).toBe(0);
    expect(getTicketStatusStep(TicketStatus.ASSIGNED)).toBe(1);
    expect(getTicketStatusStep(TicketStatus.INVESTIGATE)).toBe(2);
    expect(getTicketStatusStep(TicketStatus.WAITING_CUSTOMER)).toBe(3);
    expect(getTicketStatusStep(TicketStatus.WAITING_PARTNER)).toBe(4);
    expect(getTicketStatusStep(TicketStatus.WAITING_INTERNAL)).toBe(5);
    expect(getTicketStatusStep(TicketStatus.RESOLVED)).toBe(6);
    expect(getTicketStatusStep(TicketStatus.CLOSED)).toBe(7);
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

  it('reopen is allowed from CLOSED back to INVESTIGATE', () => {
    const closed = fullRcaTicket({ status: TicketStatus.CLOSED, feedbackScore: 5 });
    expect(canTransition(closed, TicketStatus.INVESTIGATE, UserRole.BU_SUPPORT)).toBe(true);
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
