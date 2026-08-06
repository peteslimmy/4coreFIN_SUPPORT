import { z } from 'zod';
import crypto from 'crypto';

/**
 * Check if password has been exposed in known breaches
 * Uses HaveIBeenPwned k-anonymity API
 */
export async function isPwned(password: string): Promise<boolean> {
  try {
    // SHA-1 hash of password
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

    // First 5 chars as prefix
    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    // Query HIBP API
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'User-Agent': '4CoreFinSupport/1.0' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.warn('HIBP API error:', response.status);
      return false; // Fail open - don't block on API issues
    }

    const text = await response.text();
    const lines = text.split('\n');

    // Check if our suffix exists in the response
    for (const line of lines) {
      const [hashSuffix, count] = line.split(':');
      if (hashSuffix === suffix) {
        return parseInt(count, 10) > 0;
      }
    }

    return false;
  } catch (error) {
    console.warn('HIBP check failed:', error);
    return false; // Fail open
  }
}

/**
 * Password strength schema with HIBP check
 * Min 12 chars, upper, lower, number, special char, not pwned
 */
export const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
  .refine(
    async (pwd) => !await isPwned(pwd),
    'This password has appeared in known data breaches. Please choose a different password.'
  );

/**
 * Validate password synchronously (for client-side)
 * Returns array of error messages
 */
export function validatePasswordSync(password: string): string[] {
  const errors: string[] = [];

  if (password.length < 12) errors.push('Password must be at least 12 characters');
  if (password.length > 128) errors.push('Password must not exceed 128 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must contain at least one special character');

  // Common patterns to reject
  if (/(.)\1{2,}/.test(password)) errors.push('Password contains repeating characters');
  if (/123|abc|qwe|password|admin/i.test(password)) errors.push('Password contains common patterns');

  return errors;
}

/**
 * Estimate password strength (0-4)
 * 0: Very weak, 1: Weak, 2: Fair, 3: Strong, 4: Very strong
 */
export function estimatePasswordStrength(password: string): number {
  let score = 0;

  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;

  // Penalize common patterns
  if (/(.)\1{2,}/.test(password)) score = Math.max(0, score - 1);
  if (/123|abc|qwe|password|admin/i.test(password)) score = Math.max(0, score - 2);

  return Math.min(4, Math.floor(score / 2));
}

/**
 * Get password strength label
 */
export function getPasswordStrengthLabel(score: number): { label: string; color: string } {
  switch (score) {
    case 0: return { label: 'Very Weak', color: 'text-error' };
    case 1: return { label: 'Weak', color: 'text-error' };
    case 2: return { label: 'Fair', color: 'text-warning' };
    case 3: return { label: 'Strong', color: 'text-success' };
    case 4: return { label: 'Very Strong', color: 'text-success' };
    default: return { label: 'Unknown', color: 'text-text-muted' };
  }
}