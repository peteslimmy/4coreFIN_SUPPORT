import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkWebhookUrl, isBlockedIp } from '../../server/lib/webhookUrlGuard';

// Deterministic DNS for unit tests: no real network in CI.
// vi.hoisted keeps the factory's reference valid despite vi.mock hoisting.
const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(async (hostname: string) => {
    switch (hostname) {
      case 'public.example.com':
        return [{ address: '93.184.216.34', family: 4 }];
      case 'metadata.google.internal':
        // Friendly hostname resolving into link-local metadata space.
        return [{ address: '169.254.169.254', family: 4 }];
      case 'internal.corp':
        return [{ address: '10.0.0.5', family: 4 }];
      default:
        throw new Error('getaddrinfo ENOTFOUND');
    }
  }),
}));

vi.mock('dns/promises', () => ({
  lookup: lookupMock,
  default: { lookup: lookupMock },
}));

const ORIGINAL_ENV = process.env.NODE_ENV;

describe('webhookUrlGuard (BUG-05 SSRF regression)', () => {
  beforeEach(() => {
    // Simulate production: strict https-only + private-address blocking.
    process.env.NODE_ENV = 'production';
  });
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_ENV;
  });

  describe('scheme validation', () => {
    it('accepts https URLs on public addresses', async () => {
      const r = await checkWebhookUrl('https://public.example.com/x');
      expect(r.ok).toBe(true);
    });

    it('blocks a friendly hostname that resolves to the cloud metadata IP', async () => {
      const r = await checkWebhookUrl('https://metadata.google.internal/computeMetadata/v1/');
      expect(r.ok).toBe(false);
    });

    it('blocks a friendly hostname that resolves into RFC1918 space', async () => {
      const r = await checkWebhookUrl('https://internal.corp/api');
      expect(r.ok).toBe(false);
    });

    it('rejects plain http in production', async () => {
      const r = await checkWebhookUrl('http://hooks.example.com/x');
      expect(r.ok).toBe(false);
    });

    it.each(['file:///etc/passwd', 'ftp://example.com/x', 'gopher://x', 'data:text/plain,hi'])(
      'rejects non-http(s) scheme %s',
      async (url) => {
        const r = await checkWebhookUrl(url);
        expect(r.ok).toBe(false);
      }
    );

    it('rejects malformed URLs', async () => {
      const r = await checkWebhookUrl('not a url');
      expect(r.ok).toBe(false);
    });
  });

  describe('private address blocking', () => {
    it.each([
      'https://169.254.169.254/latest/meta-data/',   // cloud metadata
      'https://127.0.0.1/admin',                     // loopback
      'https://10.1.2.3/internal',                   // RFC1918
      'https://172.16.0.9/internal',                 // RFC1918
      'https://192.168.1.1/router',                  // RFC1918
      'https://[::1]/admin',                         // IPv6 loopback
      'https://[fe80::1]/admin',                     // IPv6 link-local
    ])('blocks %s', async (url) => {
      const r = await checkWebhookUrl(url);
      expect(r.ok).toBe(false);
    });
  });

  describe('non-production relaxation', () => {
    it('allows http and localhost outside production for integration receivers', async () => {
      process.env.NODE_ENV = 'test';
      const r = await checkWebhookUrl('http://localhost:9911/receiver');
      expect(r.ok).toBe(true);
    });
  });

  describe('isBlockedIp', () => {
    it.each([
      '127.0.0.1', '10.0.0.1', '172.31.255.255', '192.168.0.1',
      '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1',
      '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1',
    ])('blocks %s', (ip) => {
      expect(isBlockedIp(ip)).toBe(true);
    });

    it.each(['8.8.8.8', '1.1.1.1', '52.94.236.248'])('allows public %s', (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    });
  });
});
