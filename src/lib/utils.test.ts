import { describe, it, expect } from 'vitest';
import { getTicketStatusStep, TICKET_STATUS_ORDER } from './utils';
import { TicketStatus } from '../types/app';

describe('getTicketStatusStep', () => {
  it('returns the correct step index for each lifecycle status', () => {
    expect(getTicketStatusStep(TicketStatus.RECEIPT)).toBe(0);
    expect(getTicketStatusStep(TicketStatus.ASSIGNED)).toBe(1);
    expect(getTicketStatusStep(TicketStatus.INVESTIGATE)).toBe(2);
    expect(getTicketStatusStep(TicketStatus.WAITING_CUSTOMER)).toBe(3);
    expect(getTicketStatusStep(TicketStatus.WAITING_PARTNER)).toBe(4);
    expect(getTicketStatusStep(TicketStatus.WAITING_INTERNAL)).toBe(5);
    expect(getTicketStatusStep(TicketStatus.RESOLVED)).toBe(6);
    expect(getTicketStatusStep(TicketStatus.CLOSED)).toBe(7);
  });

  it('maps to lowercase/alt strings via the canonical order', () => {
    expect(getTicketStatusStep('CLOSED')).toBe(7);
    expect(getTicketStatusStep('RESOLVED')).toBe(6);
    expect(getTicketStatusStep('closed' as unknown as TicketStatus)).toBe(0);
  });

  it('returns 0 for unknown statuses instead of silently landing on Resolved', () => {
    expect(getTicketStatusStep('CANCELLED')).toBe(0);
    expect(getTicketStatusStep(undefined)).toBe(0);
  });

  it('keeps the order in sync with the UI progress steps', () => {
    expect(TICKET_STATUS_ORDER).toEqual([
      'RECEIPT',
      'ASSIGNED',
      'INVESTIGATE',
      'WAITING_CUSTOMER',
      'WAITING_PARTNER',
      'WAITING_INTERNAL',
      'RESOLVED',
      'CLOSED',
    ]);
  });
});
