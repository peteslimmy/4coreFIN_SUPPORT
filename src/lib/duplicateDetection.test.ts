import { describe, it, expect } from 'vitest';
import { TicketStatus, TicketPriority, type TicketRecord } from '../types/app';
import { getDefaultBuFormConfigs, getBuFormConfig } from './formConfigs';
import { detectDuplicates, buildDuplicatePayload, similarity, normalizeKey } from './duplicateDetection';

function makeTicket(partial: Partial<TicketRecord>): TicketRecord {
  return {
    id: 'TKT-001',
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    businessUnit: 'POSSAP',
    partner: 'Parkway',
    category: 'Failed Payment',
    priority: TicketPriority.HIGH,
    status: TicketStatus.RECEIPT,
    amount: 0,
    transactionId: 'TXN_001',
    description: 'desc',
    createdAt: new Date().toISOString(),
    slaDeadline: new Date().toISOString(),
    isEscalated: false,
    escalationCount: 0,
    assignedAgentId: 'Parkway Payment Partner Team',
    majorIncidentId: null,
    feedbackScore: null,
    feedbackComment: null,
    submittedBy: 'BU_SUPPORT',
    ...partial,
  };
}

const config = getBuFormConfig(getDefaultBuFormConfigs(), 'POSSAP');
const configWithAmountKey = {
  ...config,
  fields: config.fields.map(f => (f.id === 'amount' ? { ...f, duplicateKey: true } : f)),
};

describe('duplicateDetection', () => {
  it('normalizes keys ignoring case, whitespace and punctuation', () => {
    expect(normalizeKey('  TXN_942295-01 ')).toBe('txn94229501');
    expect(normalizeKey('TXN_942295-01')).toBe('txn94229501');
    expect(normalizeKey('TXN 942295.01')).toBe('txn94229501');
  });

  it('computes string similarity', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('TXN_94229501', 'TXN_94229502')).toBeGreaterThan(0.85);
    expect(similarity('completely-different', 'value')).toBeLessThan(0.5);
  });

  it('detects an exact transactionId duplicate within the same BU', () => {
    const existing = makeTicket({ id: 'RET-26JUL17-001', businessUnit: 'POSSAP', transactionId: 'TXN_777777', status: TicketStatus.ASSIGNED });
    const candidates = detectDuplicates(
      { transactionId: 'TXN_777777', referenceId: '' },
      config,
      [existing],
      'POSSAP'
    );
    expect(candidates.length).toBe(1);
    expect(candidates[0].ticket.id).toBe('RET-26JUL17-001');
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(60);
  });

  it('does not flag duplicates from a different BU', () => {
    const existing = makeTicket({ id: 'OTHER-001', businessUnit: 'SME', transactionId: 'TXN_777777' });
    const candidates = detectDuplicates(
      { transactionId: 'TXN_777777', referenceId: '' },
      config,
      [existing],
      'POSSAP'
    );
    expect(candidates.length).toBe(0);
  });

  it('detects fuzzy matches with lower confidence', () => {
    const existing = makeTicket({ id: 'RET-26JUL17-002', businessUnit: 'POSSAP', transactionId: 'TXN_999999' });
    const candidates = detectDuplicates(
      { transactionId: 'TXN_999998', referenceId: '' },
      config,
      [existing],
      'POSSAP'
    );
    expect(candidates.length).toBe(1);
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(55);
    const exact = detectDuplicates({ transactionId: 'TXN_999999', referenceId: '' }, config, [existing], 'POSSAP');
    expect(exact[0].confidence).toBeGreaterThan(candidates[0].confidence);
  });

  it('matches on a currency amount exactly when flagged as a key', () => {
    const existing = makeTicket({ id: 'RET-26JUL17-003', businessUnit: 'POSSAP', amount: 150000, transactionId: '' });
    const candidates = detectDuplicates(
      { amount: '150,000.00', transactionId: '' },
      configWithAmountKey,
      [existing],
      'POSSAP'
    );
    expect(candidates.length).toBe(1);
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(60);
  });

  it('returns no candidates when no duplicate keys are populated', () => {
    const existing = makeTicket({ id: 'RET-26JUL17-004', businessUnit: 'POSSAP' });
    const candidates = detectDuplicates({ transactionId: '', referenceId: '', amount: '' }, config, [existing], 'POSSAP');
    expect(candidates.length).toBe(0);
  });

  it('builds a merge payload that preserves the existing status', () => {
    const existing = makeTicket({ id: 'RET-26JUL17-005', status: TicketStatus.INVESTIGATE, description: 'original' });
    const incoming = makeTicket({
      id: 'RET-26JUL17-999',
      status: TicketStatus.RECEIPT,
      description: 'new detail',
      amount: 5000,
      customFields: { terminalId: 'TERM_1' },
    });
    const merged = buildDuplicatePayload(existing, incoming);
    expect(merged.id).toBe('RET-26JUL17-005');
    expect(merged.status).toBe(TicketStatus.INVESTIGATE);
    expect(merged.description).toContain('new detail');
    expect(merged.amount).toBe(5000);
    expect(merged.customFields).toEqual({ terminalId: 'TERM_1' });
  });
});
