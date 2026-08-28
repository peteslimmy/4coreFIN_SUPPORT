import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY environment variable is required');
}
const ENCRYPTION_KEY_PREVIOUS = process.env.ENCRYPTION_KEY_PREVIOUS || null;

function getKey(): Buffer {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars) for ${ALGORITHM}; got ${key.length} bytes`
    );
  }
  return key;
}

function getPreviousKey(): Buffer | null {
  if (!ENCRYPTION_KEY_PREVIOUS) return null;
  const key = Buffer.from(ENCRYPTION_KEY_PREVIOUS, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY_PREVIOUS must decode to exactly 32 bytes (64 hex chars) for ${ALGORITHM}; got ${key.length} bytes`
    );
  }
  return key;
}

// Validate eagerly so a misconfigured deployment crashes at boot.
getKey();
getPreviousKey();

export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format: expected iv:authTag:ciphertext');
  }
  const [ivHex, tagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  // Try current key first, then previous key for rotation grace period
  try {
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    const prevKey = getPreviousKey();
    if (!prevKey) throw new Error('Decryption failed');
    const decipher = crypto.createDecipheriv(ALGORITHM, prevKey, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export function maskValue(value: string): string {
  if (value.length <= 8) return '••••••••';
  return value.substring(0, 4) + '•'.repeat(Math.min(value.length - 8, 16)) + value.substring(value.length - 4);
}
