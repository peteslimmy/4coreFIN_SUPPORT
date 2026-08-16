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

const PASSWORD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_LOWER = 'abcdefghijkmnopqrstuvwxyz';
const PASSWORD_DIGITS = '23456789';
const PASSWORD_SYMBOLS = '!@#$%^&*-_';

/**
 * Generate a cryptographically-strong human-friendly temporary password.
 * Guarantees at least one character from each class (upper, lower, digit,
 * symbol) so it clears the front-end strength meter and server reset rules.
 */
export function buildPassword(length = 14): string {
  const randomWord = () => {
    const bytes = randomBytes(4);
    return bytes.readUInt32BE(0) >>> 0;
  };
  const pick = (charset: string) => charset[randomWord() % charset.length];

  // Shuffle independently so the "one of each class" guarantee isn't positional.
  const pool = Array.from({ length: length - 4 }, () => {
    const all = PASSWORD_UPPER + PASSWORD_LOWER + PASSWORD_DIGITS + PASSWORD_SYMBOLS;
    return pick(all);
  });
  const guaranteed = [
    pick(PASSWORD_UPPER),
    pick(PASSWORD_LOWER),
    pick(PASSWORD_DIGITS),
    pick(PASSWORD_SYMBOLS),
  ];
  const combined = [...guaranteed, ...pool];

  // Fisher–Yates shuffle using crypto-derived indices.
  for (let i = combined.length - 1; i > 0; i--) {
    const j = randomWord() % (i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join('');
}