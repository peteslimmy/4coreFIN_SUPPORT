import type { UserRecord } from '../types/admin';

export function fullNameOf(u: { firstName: string; lastName: string }): string {
  return `${u.firstName} ${u.lastName}`;
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
