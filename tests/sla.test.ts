import { describe, it, expect } from 'vitest';
import { calculateSlaDeadline } from '../src/lib/slaCalculator';
import { computeAuditHash, verifyAuditChain } from '../src/lib/compliance';
import { TicketPriority } from '../src/types/app';

describe('SLA Calculator', () => {
  it('returns a future date', () => {
    const result = calculateSlaDeadline(new Date(), 'Duplicate Debit', TicketPriority.HIGH, [], []);
    expect(new Date(result) > new Date()).toBe(true);
  });

  it('skips holidays', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const holiday = { id: 'h1', date: futureDate.toISOString().split('T')[0], name: 'Test', recurring: false };
    const result2 = calculateSlaDeadline(new Date(), 'Duplicate Debit', TicketPriority.HIGH, [], [holiday]);
    const resultDate = new Date(result2);
    expect(resultDate.toISOString().split('T')[0]).not.toBe(holiday.date);
  });
});

describe('Compliance', () => {
  it('verifies audit chain', async () => {
    const entry1 = { id: '1', timestamp: '2026-01-01', ticketId: 'T1', actor: 'Alice', role: 'BU_SUPPORT', action: 'CREATE', details: 'Created ticket', previousHash: '', hash: '' };
    const h1 = await computeAuditHash(entry1);
    entry1.hash = h1;
    const entry2 = { id: '2', timestamp: '2026-01-02', ticketId: 'T1', actor: 'Bob', role: 'PROVIDER', action: 'UPDATE', details: 'Updated', previousHash: h1, hash: '' };
    entry2.hash = await computeAuditHash(entry2);
    const result = await verifyAuditChain([entry1, entry2]);
    expect(result.valid).toBe(true);
  });
});
