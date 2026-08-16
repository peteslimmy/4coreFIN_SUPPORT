import {
  AUDIT_META,
  AUDIT_CATALOG,
  type AuditAction,
} from './auditCatalog';

/**
 * @deprecated Use `lookupTrust(action)` or the catalog directly.
 * Retained as a thin compatibility shim.  Always resolves to FULL_TRUST
 * unless the action is explicitly classified in AUDIT_META.LOW_TRUST.
 */
export function catalogActionToKind(action: AuditAction | string): string {
  return lookupTrust(typeof action === 'string' ? (action as AuditAction) : action);
}

/** Returns the trust label for an audit action: FULL_TRUST or LOW_TRUST. */
export function lookupTrust(action: string): string {
  return AUDIT_META.LOW_TRUST.includes(action as AuditAction) ? 'LOW_TRUST' : 'FULL_TRUST';
}

/**
 * Returns the low-trust reason string for actions that are outside the
 * per-ticket sequence scope, or undefined when the action is fully trusted.
 */
export function lowTrustReason(action: string): string | undefined {
  if (AUDIT_META.LOW_TRUST.includes(action as AuditAction)) {
    return 'high-volume or cross-row operation (outside per-ticket sequence)';
  }
  return undefined;
}

/** True when the action must be recorded at LOW_TRUST regardless of caller context. */
export function isLowTrust(action: string): boolean {
  return AUDIT_META.LOW_TRUST.includes(action as AuditAction);
}

/** Returns the typed event discriminator for an action, or the raw action string when absent from the catalog. */
export function actionToEvent(action: string): string {
  return AUDIT_CATALOG[action as AuditAction]?.event ?? action;
}

/**
 * Returns the catalog entry for an action.  Useful when call sites need
 * to know whether to pass an explicit `event` override to `audit()`.
 */
export function catalogEntry(action: AuditAction) {
  return AUDIT_CATALOG[action] ?? null;
}

/**
 * Enrich an AuditEntry object with the derived `event` field from the catalog.
 * Mutates and returns the entry.
 */
export function enrichAuditEntry(entry: { action: string } & Record<string, unknown>): typeof entry {
  return { ...entry, event: actionToEvent(entry.action) };
}