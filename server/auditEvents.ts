/**
 * Typed wrapper around `appendAuditLog`.
 *
 * Core contract: high → low trust mapping is now declared statically inside
 * auditCatalog.ts.  Every call site MUST pass `action: AuditAction.*` so the
 * catalog entry (`{ action, event, trust }`) is the single source of truth.
 *
 * `event` is an optional free-form discriminator for UI consumption.  When
 * omitted it falls back to the raw `action` value so legacy callers that do
 * not supply it still produce a valid row.
 *
 * `ticketId` is also optional in this shape — pass it when the audit event
 * is tied to a specific ticket, omit it for system-wide events (user
 * management, settings, incident lifecycle).
 */

import { appendAuditLog } from './repository';
import { AuditAction, type AuditEventType } from './auditCatalog';

export { AuditAction, type AuditEventType } from './auditCatalog';

export interface AuditOptions {
  ticketId?: string;
  event?: AuditEventType;
  actor: string;
  role: string;
  action: AuditAction;
  details: string;
}

export async function audit(options: AuditOptions): Promise<any> {
  const { ticketId, event, actor, role, action, details } = options;
  return appendAuditLog({
    ticketId: ticketId ?? null,
    event: event ?? action,
    actor,
    role,
    action,
    details,
  });
}