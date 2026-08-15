import type { UserRecord } from '../types/admin';

export function fullNameOf(u: { firstName?: string; lastName?: string; name?: string }): string {
  const first = u.firstName;
  const last = u.lastName;
  if (first || last) return `${first ?? ''} ${last ?? ''}`.trim();
  if (u.name) return u.name;
  return '';
}

export function normalizeUserRecord(u: { name?: string } & Partial<UserRecord>): UserRecord {
  const name = u.name || '';
  const parts = name.split(/\s+/);
  const firstName = u.firstName ?? parts[0] ?? '';
  const lastName = u.lastName ?? parts.slice(1).join(' ') ?? '';
  return {
    id: u.id,
    firstName,
    lastName,
    name: u.name,
    email: u.email,
    role: u.role,
    bu: u.bu ?? '',
    partner: u.partner,
    accountType: u.accountType,
    phone: u.phone,
    isActive: u.isActive,
  } as UserRecord;
}

export function mentionCandidates(users: UserRecord[], excludeEmail: string): UserRecord[] {
  const ex = excludeEmail.trim().toLowerCase();
  return users.filter(u => u.email.trim().toLowerCase() !== ex);
}

export function isAddressed(text: string): boolean {
  return /^@\S+\s/.test(text.trim());
}

export function applyMention(text: string, fullName: string): string {
  const rest = text.replace(/^@\S*\s?/, '').trimStart();
  return rest ? `@${fullName} ${rest}` : `@${fullName} `;
}

export function stripLeadingMention(text: string): string {
  return text.replace(/^@\S+(?:\s\S+)?\s?/, '').trimStart();
}

export function extractAddressPartial(text: string): string {
  const m = text.trim().match(/^@(\w*)/);
  return m ? m[1].toLowerCase() : '';
}

export function resolveMention(text: string, users: UserRecord[]): UserRecord | null {
  const trimmed = text.trim();
  const first = trimmed.match(/^@(\w+)/);
  if (!first) return null;
  const fullMatch = trimmed.match(/^@([\w]+(?:\s+[\w]+)?)/);
  const full = fullMatch ? fullMatch[1].replace(/\s+/g, ' ').toLowerCase() : first[1].toLowerCase();
  return (
    users.find(u => fullNameOf(u).toLowerCase() === full) ||
    users.find(u => u.firstName.toLowerCase() === first[1].toLowerCase()) ||
    null
  );
}
