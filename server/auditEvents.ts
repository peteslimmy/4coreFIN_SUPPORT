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
 *
 * PERFORMANCE CONTRACT: audit() is fire-and-forget. The write is queued onto
 * the strictly-serialized FIFO chain inside appendAuditLog (which preserves
 * hash-chain integrity under concurrency); the returned promise resolves
 * immediately so route handlers never block their HTTP response on an audit
 * round-trip (~45 call sites were awaiting 10–50ms each). Write failures are
 * logged and never propagate to callers.
 */

import { appendAuditLog } from './repository';
import { logger } from './logger';
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

export function audit(options: AuditOptions): Promise<void> {
  const { ticketId, event, actor, role, action, details } = options;
  appendAuditLog({
    ticketId: ticketId ?? null,
    event: event ?? action,
    actor,
    role,
    action,
    details,
  }).catch((err) => logger.warn({ err, action }, 'audit write failed'));
  return Promise.resolve();
}
