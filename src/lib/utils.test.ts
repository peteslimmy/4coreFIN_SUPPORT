import { describe, it, expect } from 'vitest';
import { getTicketStatusStep, TICKET_STATUS_ORDER } from './utils';
import { TicketStatus } from '../types/app';

describe('getTicketStatusStep', () => {
  it('returns the correct step index for each lifecycle status', () => {
    expect(getTicketStatusStep(TicketStatus.RECEIPT)).toBe(0);
    expect(getTicketStatusStep(TicketStatus.ASSIGNED)).toBe(1);
    expect(getTicketStatusStep(TicketStatus.INVESTIGATE)).toBe(2);
    expect(getTicketStatusStep(TicketStatus.RESOLVED)).toBe(3);
    expect(getTicketStatusStep(TicketStatus.CLOSED)).toBe(4);
  });

  it('maps to lowercase/alt strings via the canonical order', () => {
    // status strings are uppercase enums; lowercase should NOT match -> falls back to 0
    expect(getTicketStatusStep('CLOSED')).toBe(4);
    expect(getTicketStatusStep('RESOLVED')).toBe(3);
    expect(getTicketStatusStep('closed' as unknown as TicketStatus)).toBe(0);
  });

  it('returns 0 for unknown statuses instead of silently landing on Resolved', () => {
    expect(getTicketStatusStep('CANCELLED')).toBe(0);
    expect(getTicketStatusStep(undefined)).toBe(0);
  });

  it('keeps the order in sync with the UI progress steps', () => {
    // Must match TicketWorkspacePage ProgressWizard labels
    expect(TICKET_STATUS_ORDER).toEqual([
      'RECEIPT',
      'ASSIGNED',
      'INVESTIGATE',
      'RESOLVED',
      'CLOSED',
    ]);
  });
});
