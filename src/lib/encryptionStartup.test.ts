import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * Regression coverage for BUG-06: encryptionService must reject a
 * wrong-length ENCRYPTION_KEY at import (startup) time instead of crashing
 * on the first encrypt/decrypt call deep inside a request handler.
 */

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY !== undefined) process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
  else delete process.env.ENCRYPTION_KEY;
  vi.resetModules();
});

describe('encryptionService startup key validation (BUG-06 regression)', () => {
  it('imports successfully with a valid 32-byte hex key and round-trips', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    vi.resetModules();
    const mod = await import('../../server/services/encryptionService');
    expect(typeof mod.encrypt).toBe('function');
    expect(mod.decrypt(mod.encrypt('secret'))).toBe('secret');
  });

  it('throws at import when the key decodes to fewer than 32 bytes', async () => {
    process.env.ENCRYPTION_KEY = '0123456789abcdef'; // 8 bytes — previously booted fine
    vi.resetModules();
    await expect(import('../../server/services/encryptionService')).rejects.toThrow(/32 bytes/);
  });

  it('throws at import when the key is not valid hex', async () => {
    process.env.ENCRYPTION_KEY = 'zz'.repeat(40); // invalid hex → empty buffer
    vi.resetModules();
    await expect(import('../../server/services/encryptionService')).rejects.toThrow();
  });
});
