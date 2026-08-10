import { describe, it, expect } from 'vitest';
import { TicketStatus, TicketPriority, type TicketRecord, type AuditLog } from '../types/app';
import {
  isAtRisk,
  getMttrHours,
  computePartnerMetrics,
  computeAtRiskExposure,
  computeRiskRegister,
  riskLevelFor,
  computeComplianceTrend,
  computePeriodDeltas,
  computeFcrRate,
  computeRftRate,
  generateExecutiveInsights,
  computeHealthScore,
} from './executiveMetrics';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const now = Date.now();

function makeTicket(partial: Partial<TicketRecord>): TicketRecord {
  return {
    id: 'TKT-TEST-001',
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    businessUnit: 'POSSAP',
    partner: 'Parkway',
    category: 'Payment Dispute',
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.INVESTIGATE,
    amount: 100000,
    transactionId: 'TXN-TEST',
    description: 'Test ticket',
    createdAt: new Date(now - 1 * DAY).toISOString(),
    slaDeadline: new Date(now + 2 * DAY).toISOString(),
    isEscalated: false,
    escalationCount: 0,
    assignedAgentId: 'Agent A',
    majorIncidentId: null,
    feedbackScore: null,
    feedbackComment: null,
    submittedBy: 'BU_SUPPORT',
    ...partial,
  };
}

describe('getMttrHours', () => {
  it('computes real MTTR from resolvedAt minus createdAt', () => {
    const t = makeTicket({
      createdAt: new Date(now - 48 * HOUR).toISOString(),
      rcaDetails: { resolvedAt: new Date(now - 40 * HOUR).toISOString(), rootCause: '', contributingFactors: '', correctiveActions: '', preventiveActions: '', preventiveOwner: '', preventiveDueDate: '' },
    });
    expect(getMttrHours(t)).toBeCloseTo(8, 5);
  });

  it('returns null when resolvedAt is missing', () => {
    expect(getMttrHours(makeTicket({}))).toBeNull();
  });
});

describe('isAtRisk', () => {
  it('flags active tickets with < 24h remaining as at risk', () => {
    const t = makeTicket({ status: TicketStatus.ASSIGNED, slaDeadline: new Date(now + 12 * HOUR).toISOString() });
    expect(isAtRisk(t, now)).toBe(true);
  });

  it('ignores closed and already escalated tickets', () => {
    const closed = makeTicket({ status: TicketStatus.CLOSED, slaDeadline: new Date(now + 2 * HOUR).toISOString() });
    const escalated = makeTicket({ isEscalated: true, slaDeadline: new Date(now + 2 * HOUR).toISOString() });
    expect(isAtRisk(closed, now)).toBe(false);
    expect(isAtRisk(escalated, now)).toBe(false);
  });
});

describe('computePartnerMetrics', () => {
  it('computes sla, real mttr, reopen and satisfaction per partner', () => {
    const tickets = [
      makeTicket({ partner: 'Parkway', status: TicketStatus.CLOSED, isEscalated: false, feedbackScore: 5, createdAt: new Date(now - 2 * DAY).toISOString(), rcaDetails: { resolvedAt: new Date(now - 1.5 * DAY).toISOString(), rootCause: '', contributingFactors: '', correctiveActions: '', preventiveActions: '', preventiveOwner: '', preventiveDueDate: '' } }),
      makeTicket({ partner: 'Parkway', status: TicketStatus.ASSIGNED, isEscalated: true, feedbackScore: null }),
    ];
    const rows = computePartnerMetrics(tickets, ['Parkway']);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.sla).toBe(50);
    expect(row.reopen).toBe(0);
    expect(row.satisfaction).toBe(5);
    expect(row.mttr).toBeCloseTo(12, 5);
  });

  it('falls back to a heuristic when no real MTTR exists', () => {
    const tickets = [makeTicket({ partner: 'Adyen', status: TicketStatus.ASSIGNED, isEscalated: true })];
    const rows = computePartnerMetrics(tickets, ['Adyen']);
    expect(rows[0].mttr).toBeGreaterThan(0);
  });
});

describe('computeAtRiskExposure', () => {
  it('sums exposure of breached and at-risk open tickets only', () => {
    const tickets = [
      makeTicket({ id: 'A', isEscalated: true, status: TicketStatus.ASSIGNED, amount: 50000 }),
      makeTicket({ id: 'B', status: TicketStatus.ASSIGNED, amount: 30000, slaDeadline: new Date(now + 6 * HOUR).toISOString() }),
      makeTicket({ id: 'C', status: TicketStatus.ASSIGNED, amount: 70000, slaDeadline: new Date(now + 5 * DAY).toISOString() }),
      makeTicket({ id: 'D', status: TicketStatus.CLOSED, isEscalated: true, amount: 90000 }),
    ];
    expect(computeAtRiskExposure(tickets, now)).toBe(80000);
  });
});

describe('computeRiskRegister', () => {
  it('sorts open tickets by descending risk score', () => {
    const tickets = [
      makeTicket({ id: 'LOW', status: TicketStatus.ASSIGNED, isEscalated: false, priority: TicketPriority.LOW, slaDeadline: new Date(now + 5 * DAY).toISOString() }),
      makeTicket({ id: 'HIGH', status: TicketStatus.ASSIGNED, isEscalated: true, priority: TicketPriority.CRITICAL, slaDeadline: new Date(now - 1 * DAY).toISOString() }),
      makeTicket({ id: 'MED', status: TicketStatus.ASSIGNED, isEscalated: false, priority: TicketPriority.HIGH, slaDeadline: new Date(now + 6 * HOUR).toISOString() }),
      makeTicket({ id: 'CLOSED', status: TicketStatus.CLOSED, isEscalated: true, priority: TicketPriority.CRITICAL }),
    ];
    const register = computeRiskRegister(tickets, now);
    expect(register.map(r => r.id)).toEqual(['HIGH', 'MED', 'LOW']);
    expect(register[0].riskLevel).toBe('critical');
  });

  it('maps risk levels by score bands', () => {
    expect(riskLevelFor(85)).toBe('critical');
    expect(riskLevelFor(65)).toBe('high');
    expect(riskLevelFor(45)).toBe('medium');
    expect(riskLevelFor(20)).toBe('low');
  });
});

describe('computeComplianceTrend', () => {
  it('builds a per-day compliance series', () => {
    const tickets = [
      makeTicket({ id: 'A', isEscalated: false, createdAt: new Date(now - 1 * DAY).toISOString() }),
      makeTicket({ id: 'B', isEscalated: true, createdAt: new Date(now - 1 * DAY).toISOString() }),
    ];
    const trend = computeComplianceTrend(tickets, 7, now);
    expect(trend).toHaveLength(7);
    const yesterday = trend[5];
    expect(yesterday.compliance).toBe(50);
  });
});

describe('computePeriodDeltas', () => {
  it('compares current vs previous window percentages', () => {
    const tickets = [
      makeTicket({ id: 'old', createdAt: new Date(now - 10 * DAY).toISOString(), isEscalated: true }),
      makeTicket({ id: 'recent', createdAt: new Date(now - 1 * DAY).toISOString(), isEscalated: false }),
    ];
    const deltas = computePeriodDeltas(tickets, now, 7);
    expect(deltas.createdDelta).toBe(0);
    expect(deltas.breachDelta).toBe(-100);
  });
});

describe('FCR and RFT', () => {
  it('computes first contact resolution from closed tickets', () => {
    const closed = [
      makeTicket({ status: TicketStatus.CLOSED, isEscalated: false, feedbackScore: 5 }),
      makeTicket({ status: TicketStatus.CLOSED, isEscalated: true, feedbackScore: 2 }),
    ];
    expect(computeFcrRate(closed)).toBe(50);
    expect(computeRftRate(closed)).toBe(50);
  });
});

describe('computeHealthScore', () => {
  it('blends fcr, rft, sla and csat into a 0-100 score', () => {
    const { score, parts } = computeHealthScore(80, 80, 95, 4.5);
    expect(parts).toEqual({ fcr: 80, rft: 80, sla: 95, csat: 90 });
    expect(score).toBe(86);
  });
});

describe('generateExecutiveInsights', () => {
  it('surfaces breaches, critical backlog and weak partners', () => {
    const tickets = [
      makeTicket({ id: 'A', isEscalated: true, status: TicketStatus.ASSIGNED, priority: TicketPriority.CRITICAL, partner: 'Parkway' }),
      makeTicket({ id: 'B', status: TicketStatus.ASSIGNED, priority: TicketPriority.CRITICAL }),
    ];
    const insights = generateExecutiveInsights({ tickets, partners: ['Parkway'], deltas: { createdDelta: 10, exposureDelta: 5, breachDelta: 20, closedDelta: -5 } });
    expect(insights.some(i => i.title === 'Active SLA breaches')).toBe(true);
    expect(insights.some(i => i.title === 'Critical priority backlog')).toBe(true);
  });

  it('returns nominal insight when all clear', () => {
    const tickets = [makeTicket({ status: TicketStatus.CLOSED, isEscalated: false })];
    const insights = generateExecutiveInsights({ tickets, partners: ['Parkway'], deltas: { createdDelta: 0, exposureDelta: 0, breachDelta: 0, closedDelta: 0 } });
    expect(insights[0].type).toBe('info');
  });
});

describe('audit health', () => {
  it('summarizes audit logs by action and actor', async () => {
    const { computeAuditHealth } = await import('./executiveMetrics');
    const logs: AuditLog[] = [
      { id: '1', timestamp: new Date(now - 2 * HOUR).toISOString(), ticketId: 'T', actor: 'Sarah', role: 'BU_SUPPORT', action: 'CREATED_TICKET', details: 'x', hash: 'abc', previousHash: 'def' },
      { id: '2', timestamp: new Date(now - 3 * HOUR).toISOString(), ticketId: 'T', actor: 'Sarah', role: 'BU_SUPPORT', action: 'CREATED_TICKET', details: 'x' },
      { id: '3', timestamp: new Date(now - 4 * HOUR).toISOString(), ticketId: 'T', actor: 'Adaobi', role: 'SUPER_ADMIN', action: 'CLOSED_TICKET', details: 'x' },
    ];
    const health = computeAuditHealth(logs);
    expect(health.total).toBe(3);
    expect(health.verified).toBe(1);
    expect(health.byAction.CREATED_TICKET).toBe(2);
    expect(health.byActor.Adaobi).toBe(1);
    expect(health.recent).toHaveLength(3);
  });
});
