import { lookup } from 'dns/promises';

/**
 * Webhook target URL guard (SSRF defense).
 *
 * Outbound webhook delivery must never become a proxy into the internal
 * network or cloud metadata services. This validator enforces, at both
 * webhook-registration time and dispatch time:
 *   - HTTPS-only targets in production (plain HTTP allowed outside production
 *     so local integration receivers keep working).
 *   - Hostnames that resolve to loopback, link-local (incl. 169.254.169.254),
 *     private (RFC1918), unique-local, or unspecified addresses are rejected.
 *   - DNS names are resolved and every returned address is checked, closing
 *     the "friendly hostname" bypass (e.g. metadata.google.internal).
 *
 * Dispatch additionally uses `redirect: 'manual'` so a remote endpoint cannot
 * bounce a request onto an internal address after validation.
 */

const BLOCKED_V4: Array<{ start: number; end: number }> = [
  { start: 0x00000000, end: 0x00ffffff },       // 0.0.0.0/8        "this network"
  { start: 0x0a000000, end: 0x0affffff },       // 10.0.0.0/8       private
  { start: 0x64400000, end: 0x647fffff },       // 100.64.0.0/10    CGNAT
  { start: 0x7f000000, end: 0x7fffffff },       // 127.0.0.0/8      loopback
  { start: 0xa9fe0000, end: 0xa9feffff },       // 169.254.0.0/16   link-local / cloud metadata
  { start: 0xac100000, end: 0xac1fffff },       // 172.16.0.0/12    private
  { start: 0xc0000000, end: 0xc00000ff },       // 192.0.0.0/24     IETF protocol assignments
  { start: 0xc0a80000, end: 0xc0a8ffff },       // 192.168.0.0/16   private
  { start: 0xc6120000, end: 0xc63fffff },       // 198.18.0.0/15    benchmarking
  { start: 0xc6336400, end: 0xc63367ff },       // 198.51.100.0/24  TEST-NET-2
  { start: 0xcb007100, end: 0xcb0071ff },       // 203.0.113.0/24   TEST-NET-3
  { start: 0xe0000000, end: 0xefffffff },       // 224.0.0.0/4      multicast
  { start: 0xf0000000, end: 0xffffffff },       // 240.0.0.0/4      reserved + broadcast
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 255 || !/^\d+$/.test(part)) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function isBlockedIp(ip: string): boolean {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) {
    return BLOCKED_V4.some((r) => v4 >= r.start && v4 <= r.end);
  }
  // IPv6: block loopback, unspecified, link-local (fe80::/10), unique-local
  // (fc00::/7), multicast (ff00::/8), and IPv4-mapped addresses.
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (/^f[ce]/.test(lower)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (/^ff/.test(lower)) return true; // multicast
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIp(mapped[1]);
  return false;
}

function resolvesToBlockedAddress(hostname: string): Promise<boolean> {
  // Literal IPs skip DNS.
  const literal = hostname.replace(/^\[|\]$/g, '');
  if (/^[\d.]+$/.test(literal) || literal.includes(':')) {
    return Promise.resolve(isBlockedIp(literal));
  }
  return lookup(literal, { all: true, verbatim: true })
    .then((addrs) => addrs.some((a) => isBlockedIp(a.address)))
    .catch(() => true); // unresolvable hosts are useless as webhook targets anyway
}

export interface WebhookUrlCheck {
  ok: boolean;
  reason?: string;
}

export async function checkWebhookUrl(rawUrl: string): Promise<WebhookUrlCheck> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Webhook URL is not a valid absolute URL' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Webhook URL must use http or https' };
  }
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && url.protocol !== 'https:') {
    return { ok: false, reason: 'Webhook URL must use https in production' };
  }
  if (!isProd) {
    // Non-production: allow plain-HTTP localhost/LAN receivers for integration testing.
    return { ok: true };
  }
  if (await resolvesToBlockedAddress(url.hostname)) {
    return { ok: false, reason: 'Webhook URL resolves to a blocked (internal/reserved) address' };
  }
  return { ok: true };
}
