import { describe, it, expect } from 'vitest';
import { getDefaultBuFormConfigs, getBuFormConfig, validateFieldValue, buildDefaultBuFormConfig } from './formConfigs';

describe('formConfigs', () => {
  it('builds a default config for every BU with version metadata', () => {
    const configs = getDefaultBuFormConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(5);
    for (const c of configs) {
      expect(c.version).toBe(1);
      expect(c.updatedBy).toBe('SYSTEM');
      expect(c.fields.length).toBeGreaterThan(0);
    }
  });

  it('returns the stored config for a BU when present', () => {
    const defaults = getDefaultBuFormConfigs();
    const custom = buildDefaultBuFormConfig('POSSAP');
    custom.fields = custom.fields.map(f => ({ ...f, required: false }));
    const config = getBuFormConfig([...defaults.filter(c => c.bu !== 'POSSAP'), custom], 'POSSAP');
    expect(config.bu).toBe('POSSAP');
    expect(config.fields.every(f => !f.required)).toBe(true);
  });

  it('falls back to a default config for unknown BUs', () => {
    const config = getBuFormConfig([], 'UNKNOWN-BU');
    expect(config.bu).toBe('UNKNOWN-BU');
    expect(config.fields.length).toBeGreaterThan(0);
  });

  it('validates required fields', () => {
    const config = buildDefaultBuFormConfig('POSSAP');
    const reason = config.fields.find(f => f.id === 'reason')!;
    expect(validateFieldValue(reason, '')).toContain('required');
    expect(validateFieldValue(reason, 'Settlement delay')).toBe('');
  });

  it('validates currency fields with positive naira amounts', () => {
    const config = buildDefaultBuFormConfig('POSSAP');
    const amount = config.fields.find(f => f.id === 'amount')!;
    expect(validateFieldValue(amount, '')).toBe('');
    expect(validateFieldValue(amount, '1,000.00')).toBe('');
    expect(validateFieldValue(amount, 'abc')).toContain('valid');
  });

  it('flags duplicate-key fields by default', () => {
    const config = buildDefaultBuFormConfig('POSSAP');
    const tx = config.fields.find(f => f.id === 'transactionId')!;
    const ref = config.fields.find(f => f.id === 'referenceId')!;
    expect(tx.duplicateKey).toBe(true);
    expect(ref.duplicateKey).toBe(true);
  });
});
