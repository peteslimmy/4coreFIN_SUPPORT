import { randomBytes, randomUUID } from 'node:crypto';

/** Prefix an unpredictable v4 UUID as a compact entity id, e.g. `tkt-81f3cb42-…`. */
export function buildId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * Secure random alphanumeric token (URL-safe alphabet). Used for activation and
 * recovery secrets where the token may appear in a URL query string.
 */
export function buildToken(byteLength = 24): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Crypto-random numeric appendage for ids that need to stay short (e.g.
 * notification ids). Base36 keeps them couple-friendly but unpredictable.
 */
export function buildRandomSuffix(): string {
  return randomBytes(4).toString('base64url');
}