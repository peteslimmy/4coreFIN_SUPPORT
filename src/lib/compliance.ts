import type { AuditLog } from '../types/app';

export async function computeAuditHash(entry: AuditLog): Promise<string> {
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
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return 'sha256-' + hashHex;
}

export async function verifyAuditChain(logs: AuditLog[]): Promise<{ valid: boolean; brokenIndex: number | null }> {
  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];
    const expectedPreviousHash = i > 0 ? (logs[i - 1].hash || '') : '';
    if ((entry.previousHash || '') !== expectedPreviousHash) {
      return { valid: false, brokenIndex: i };
    }
    const expectedHash = await computeAuditHash({
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
