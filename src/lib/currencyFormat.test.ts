import { describe, it, expect } from 'vitest';
import { formatCurrencyInput, parseNaira } from './currencyFormat';

describe('formatCurrencyInput', () => {
  it('formats plain digits with thousands separators', () => {
    expect(formatCurrencyInput('1000000')).toBe('1,000,000');
  });

  it('keeps up to two decimal places', () => {
    expect(formatCurrencyInput('1250.009')).toBe('1,250.00');
    expect(formatCurrencyInput('1250.5')).toBe('1,250.5');
  });

  it('strips non-numeric characters', () => {
    expect(formatCurrencyInput('₦1,250,000.00')).toBe('1,250,000.00');
  });

  it('handles empty and partial input', () => {
    expect(formatCurrencyInput('')).toBe('');
    expect(formatCurrencyInput('.50')).toBe('0.50');
  });

  it('removes leading zeros', () => {
    expect(formatCurrencyInput('0001250')).toBe('1,250');
  });
});

describe('parseNaira', () => {
  it('parses a formatted amount to a number', () => {
    expect(parseNaira('1,250,000.00')).toBe(1250000);
    expect(parseNaira('45000')).toBe(45000);
  });

  it('returns 0 for empty input', () => {
    expect(parseNaira('')).toBe(0);
    expect(parseNaira('abc')).toBe(0);
  });
});
