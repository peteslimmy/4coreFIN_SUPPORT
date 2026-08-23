import { supabase } from './supabase';

// ── Security events service ──────────────────────────────────────────
// Records security-relevant events separately from business audit.
// Used for login tracking, access control monitoring, and security telemetry.

const TBL = (name: string) => `security.${name}` as any;

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'MFA_FAILURE'
  | 'ACCESS_DENIED'
  | 'RATE_LIMIT_TRIGGERED'
  | 'SUSPICIOUS_ACCESS'
  | 'SESSION_REVOKED'
  | 'PASSWORD_CHANGED'
  | 'ACCOUNT_LOCKED';

export interface SecurityEventInput {
  eventType: SecurityEventType;
  actorUserId?: string;
  actorEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface SecurityEvent {
  id: string;
  event_type: SecurityEventType;
  actor_user_id: string | null;
  actor_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

/**
 * Record a security event. Fire-and-forget safe — errors are logged but
 * never thrown so they cannot break the calling flow.
 */
export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    const row = {
      event_type: input.eventType,
      actor_user_id: input.actorUserId ?? null,
      actor_email: input.actorEmail ?? null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
      metadata: input.metadata ?? {},
    };
    const { error } = await supabase.from(TBL('events')).insert(row);
    if (error) {
      console.error('[security-events] Failed to record event:', error.message);
    }
  } catch {
    // Silently ignore — security logging must never break the request
  }
}

/**
 * Query security events. Limited to recent events for admin review.
 */
export async function listSecurityEvents(opts?: {
  eventType?: SecurityEventType;
  actorEmail?: string;
  limit?: number;
  offset?: number;
}): Promise<SecurityEvent[]> {
  let q = supabase.from(TBL('events')).select('*').order('occurred_at', { ascending: false });
  if (opts?.eventType) q = q.eq('event_type', opts.eventType);
  if (opts?.actorEmail) q = q.eq('actor_email', opts.actorEmail);
  if (opts?.limit) q = q.limit(opts.limit);
  if (opts?.offset) q = q.range(opts.offset, (opts.offset + (opts.limit ?? 50)) - 1);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SecurityEvent[];
}
