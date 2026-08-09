import { describe, it, expect } from 'vitest';
import { suggestBuCode, normalizeBusinessUnits, buCodeFor, nextTicketId, yymmdd } from './buCodes';

describe('suggestBuCode', () => {
  it('derives an uppercase code from the name', () => {
    expect(suggestBuCode('POSSAP')).toBe('POS');
    expect(suggestBuCode('Retail-B')).toBe('RET');
  });

  it('falls back to BU for an empty name', () => {
    expect(suggestBuCode('')).toBe('BU');
    expect(suggestBuCode('   ')).toBe('BU');
  });
});

describe('normalizeBusinessUnits', () => {
  it('normalizes mixed string and object entries preserving order', () => {
    const raw = ['ALPHA', { name: 'BETA', code: 'BT' }];
    const units = normalizeBusinessUnits(raw);
    expect(units.map((b) => b.name)).toEqual(['ALPHA', 'BETA']);
    expect(units[0].code).toBe('ALP');
    expect(units[1].code).toBe('BT');
  });

  it('derives unique codes for colliding suggestions', () => {
    const units = normalizeBusinessUnits(['ALPHA', 'ALPHABET']);
    const codes = units.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('buCodeFor', () => {
  it('looks up by name case-insensitively', () => {
    expect(buCodeFor('POSSAP', [{ name: 'POSSAP', code: 'POSA' }])).toBe('POSA');
    expect(buCodeFor('possap', [{ name: 'POSSAP', code: 'POSA' }])).toBe('POSA');
    expect(buCodeFor('MISSING', [{ name: 'POSSAP', code: 'POSA' }])).toBeNull();
  });
});

describe('nextTicketId', () => {
  const buRaw = [{ name: 'POSSAP', code: 'POS' }];
  const date = new Date(2026, 7, 7);

  it('uses BUCODE-yymmdd-NNN format', () => {
    expect(nextTicketId('POSSAP', buRaw, [], date)).toBe(`POS-${yymmdd(date)}-001`);
  });

  it('increments the sequence based on existing ids', () => {
    const existing = [`POS-${yymmdd(date)}-001`, `POS-${yymmdd(date)}-002`];
    expect(nextTicketId('POSSAP', buRaw, existing, date)).toBe(`POS-${yymmdd(date)}-003`);
  });

  it('falls back to legacy TKT-<ms> when the BU has no code', () => {
    const now = new Date(2026, 7, 7, 12, 0, 0);
    expect(nextTicketId('UNKNOWN', [], [], now)).toBe(`TKT-${now.getTime()}`);
  });
});