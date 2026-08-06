let serverCounter = 0;

function timestampedId(prefix: string): string {
  serverCounter = (serverCounter + 1) % 9999;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${ts}-${serverCounter.toString(36)}${rand}`;
}

/**
 * Generate a unique identifier. Uses crypto.randomUUID when available
 * (modern browsers + Node 19+), otherwise falls back to a timestamp +
 * counter + random suffix that remains unique within a single session.
 */
export function uid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return timestampedId(prefix);
}

/** Human-friendlier ID for records surfaced in UI (audit logs, tickets). */
export function makeTimestampedId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
