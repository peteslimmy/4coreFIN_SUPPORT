import crypto from 'crypto';
import { isBuSupportRole, isGlobalRole } from './rbac';

export interface AuditEntry {
  id: string;
  timestamp: string;
  ticketId: string | null;
  actor: string;
  role: string;
  event?: string | null;
  action: string;
  details: string;
  hash?: string;
  previousHash?: string;
}

/** SHA-256 hash chain for append-only audit ledger (GAID-style). */
export function computeAuditHash(entry: Omit<AuditEntry, 'hash'> & { previousHash?: string }): string {
  const payload = [
    entry.id,
    entry.timestamp,
    entry.ticketId ?? '',
    entry.actor,
    entry.role,
    entry.action,
    entry.details,
    entry.previousHash ?? '',
  ].join('|');
  return 'sha256-' + crypto.createHash('sha256').update(payload).digest('hex');
}

export function verifyAuditChain(logs: AuditEntry[]): { valid: boolean; brokenIndex: number | null } {
  // logs expected oldest-first for chain verification
  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];
    const expectedPrevious = i > 0 ? (logs[i - 1].hash || '') : '';
    if ((entry.previousHash || '') !== expectedPrevious) {
      return { valid: false, brokenIndex: i };
    }
    const expectedHash = computeAuditHash({
      id: entry.id,
      timestamp: entry.timestamp,
      ticketId: entry.ticketId,
      actor: entry.actor,
      role: entry.role,
      action: entry.action,
      details: entry.details,
      previousHash: entry.previousHash || '',
    });
    if (entry.hash !== expectedHash) {
      return { valid: false, brokenIndex: i };
    }
  }
  return { valid: true, brokenIndex: null };
}

/** Mask card PAN leaving last 4 digits. */
export function maskCardPan(pan: string | undefined | null): string {
  if (!pan) return '****';
  const digits = String(pan).replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return '****' + digits.slice(-4);
}

/** Mask email for non-privileged viewers. */
export function maskEmail(email: string | undefined | null): string {
  if (!email || !email.includes('@')) return '***@***.***';
  const [user, domain] = email.split('@');
  const u = user.length <= 2 ? user[0] + '*' : user[0] + '***' + user.slice(-1);
  return `${u}@${domain}`;
}

/** Mask phone numbers. */
export function maskPhone(phone: string | undefined | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return '***-***-' + digits.slice(-4);
}

export type AuthUser = {
  id: string;
  sub: string; // JWT subject claim (alias for id)
  name: string;
  email: string;
  role: string;
  bu: string;
  partner?: string;
  accountType?: string;
  phone?: string;
  tenantId?: string;
  mustChangePassword?: boolean; // set when a freshly-provisioned user must set their own password
  partnerOrgId?: number; // FK to partner_organizations (migration 044); set for PARTNER accounts
  tokenVersion?: number; // incremented on password change to invalidate existing JWTs
};

/**
 * Apply structural PII masking based on role.
 * SUPER_ADMIN / BU_SUPPORT / EXECUTIVE see more; PARTNER / CUSTOMER / others get masked fields.
 * Unmasking is audited separately via explicit unmask endpoint.
 */
/** Roles that may see unmasked customer data (global + every BU support tier). */
function isUnmaskedRole(role: string): boolean {
  return isGlobalRole(role) || isBuSupportRole(role);
}

export function applyTicketMasking<T extends Record<string, any>>(ticket: T, user: AuthUser, unmasked = false): T {
  if (unmasked) return ticket;
  if (isUnmaskedRole(user.role)) {
    // Still mask full PAN by default for everyone except explicit unmask
    return {
      ...ticket,
      cardPan: maskCardPan(ticket.cardPan),
    };
  }
  return {
    ...ticket,
    customerEmail: maskEmail(ticket.customerEmail),
    customerPhone: maskPhone(ticket.customerPhone),
    cardPan: maskCardPan(ticket.cardPan),
    submittedByPhone: maskPhone(ticket.submittedByPhone),
  };
}
