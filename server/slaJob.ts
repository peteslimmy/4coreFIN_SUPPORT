import { audit, AuditAction } from './auditEvents';
import { openTicketsForSla, insertNotification, getConfig } from './repository';
import { supabase } from './supabase';
import { resolveSlaDuration, effectiveSlaDeadline } from '../src/lib/slaCalculator';
import { TicketPriority } from '../src/types/app';
import { broadcast } from './broadcast';
import { dispatchWebhook } from './services/webhookDispatcher';
import { notifyByEmail, appHomeUrl } from './services/notifyEmails';
import { buildId } from './lib/ids';

const FALLBACK_RISK_FRACTION = 0.25;
const MIN_RISK_HOURS = 0.5;
const NOTIFICATION_TTL_MS = 6 * 3600000; // 6 hours

// ─── Alert dedupe ──────────────────────────────────────────────────────
// The sla_notification_log table (migration 047) makes suppression durable:
// a server restart no longer re-fires every alert. The UNIQUE(kind, ticket_id,
// recipient) constraint means an insert only succeeds for first-time alerts.
// The in-memory map remains as a fallback when the table is unavailable.

const memoryClaims = new Map<string, number>();

/** Try to claim an alert slot. Returns true when this call is the first. */
async function claimAlert(kind: string, ticketId: string, recipient: string): Promise<boolean> {
  try {
    const builder: any = supabase
      .from('sla_notification_log')
      .insert({ kind, ticket_id: ticketId, recipient });
    if (typeof builder?.onConflict === 'function') {
      const { data, error } = await builder
        .onConflict('kind,ticket_id,recipient')
        .ignoreDuplicates(true)
        .select();
      if (!error) return Array.isArray(data) && data.length > 0;
    }
  } catch {
    // Table/client capability missing — fall through to memory dedupe.
  }
  const key = `${kind}:${ticketId}:${recipient}`;
  if (memoryClaims.has(key)) return false;
  memoryClaims.set(key, Date.now());
  return true;
}

/** Prune claim rows (and memory entries) older than the TTL. */
async function pruneClaims(): Promise<void> {
  const cutoff = new Date(Date.now() - NOTIFICATION_TTL_MS).toISOString();
  try {
    const builder: any = supabase.from('sla_notification_log').delete();
    if (typeof builder?.lt === 'function') {
      await builder.lt('notified_at', cutoff);
    }
  } catch {
    // Table unavailable — nothing to prune server-side.
  }
  const now = Date.now();
  for (const [key, ts] of memoryClaims) {
    if (now - ts > NOTIFICATION_TTL_MS) memoryClaims.delete(key);
  }
}

// Overlap guard: if a scan takes longer than the interval, the next timer
// tick must not start a second concurrent scan (duplicate DB reads, doubled
// notification fan-out, event-loop contention under load).
let slaRunInProgress = false;

export async function runSlaCheck() {
  if (slaRunInProgress) return;
  slaRunInProgress = true;
  try {
    await runSlaCheckInner();
  } finally {
    slaRunInProgress = false;
  }
}

async function runSlaCheckInner() {
  await pruneClaims();
  const tickets = await openTicketsForSla();
  const configs = await getConfig<Array<{ id: string; stage: string; email: string }>>('notificationConfigs', []);

  let breachCount = 0;
  let riskCount = 0;
  let scanned = 0;
  const now = Date.now();

  for (const t of tickets) {
    scanned++;
    try {
      // Waiting tickets are excluded upstream; the effective deadline shifts
      // previously-paused tickets forward by their accumulated pause span.
      const deadline = effectiveSlaDeadline(t as any).getTime();
      if (!Number.isFinite(deadline)) continue;
      const hoursLeft = (deadline - now) / 3600000;
      const recipients = new Set<string>();

      for (const c of configs) {
        if (c.email) recipients.add(c.email);
      }
      for (const w of t.watchers || []) {
        if (w) recipients.add(w);
      }
      if (t.assignedAgentId) recipients.add(`${(t.partner || 'ops').toLowerCase()}-ops@4core.local`);

      const slaDuration = resolveSlaDuration(t.category || '', t.priority as TicketPriority, []).durationHours;
      const riskThreshold = Math.max(slaDuration * FALLBACK_RISK_FRACTION, MIN_RISK_HOURS);

      if (hoursLeft < 0 && !t.isEscalated) {
        // Recipients are independent (per-recipient dedup claims) — fan out
        // concurrently instead of N sequential round-trips.
        await Promise.all(Array.from(recipients).map(async (recipient) => {
          if (!(await claimAlert('SLA_BREACH', t.id, recipient))) return;
          await insertNotification({
            id: buildId('wn-sla'),
            timestamp: new Date().toISOString(),
            ticketId: t.id,
            message: `[SLA_BREACH] Ticket ${t.id} breached SLA deadline (${t.priority} / ${t.category}). Immediate action required.`,
            recipient,
            seen: false,
          });
          void notifyByEmail(
            recipient,
            `[4C] SLA Breach — Ticket ${t.id}`,
            `<h3>[SLA_BREACH] Ticket ${t.id}</h3><p>Ticket <strong>${t.id}</strong> breached its SLA deadline (<strong>${t.priority}</strong> / ${t.category || '—'}). Immediate action is required.</p><p><strong>Deadline:</strong> ${t.slaDeadline || '—'}</p><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`
          );
        }));
        // Audit the breach once per ticket, not on every monitor tick.
        if (await claimAlert('SLA_BREACH', t.id, '__audit__')) {
          audit({
            event: 'SLA_BREACH_DETECTED',
            ticketId: t.id,
            actor: 'SYSTEM',
            role: 'SYSTEM',
            action: AuditAction.SLA_BREACH_DETECTED,
            details: `Automated SLA monitor detected breach for ticket ${t.id}. Deadline was ${t.slaDeadline}.`,
          });
        }
        breachCount++;
        broadcast('sla_breach', { ticketId: t.id, slaDeadline: t.slaDeadline }, t.tenantId);
        dispatchWebhook('sla.breach', { ticketId: t.id, priority: t.priority, category: t.category, slaDeadline: t.slaDeadline }).catch(() => {});
      } else if (hoursLeft >= 0 && hoursLeft < riskThreshold) {
        await Promise.all(Array.from(recipients).map(async (recipient) => {
          if (!(await claimAlert('SLA_AT_RISK', t.id, recipient))) return;
          await insertNotification({
            id: buildId('wn-risk'),
            timestamp: new Date().toISOString(),
            ticketId: t.id,
            message: `[SLA_AT_RISK] Ticket ${t.id} is at risk — ${hoursLeft.toFixed(1)}h remaining before SLA breach.`,
            recipient,
            seen: false,
          });
          void notifyByEmail(
            recipient,
            `[4C] SLA At Risk — Ticket ${t.id}`,
            `<h3>[SLA_AT_RISK] Ticket ${t.id}</h3><p>Ticket <strong>${t.id}</strong> is at risk — <strong>${hoursLeft.toFixed(1)}h</strong> remaining before SLA breach (<strong>${t.priority}</strong> / ${t.category || '—'}).</p><p><strong>Deadline:</strong> ${t.slaDeadline || '—'}</p><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`
          );
        }));
        riskCount++;
        broadcast('sla_at_risk', { ticketId: t.id, hoursLeft }, t.tenantId);
      }
    } catch (e) {
      console.error(`SLA monitor error for ticket ${t.id}:`, e);
    }
  }

  if (breachCount || riskCount) {
    broadcast('sla_check_complete', { breachCount, riskCount, at: new Date().toISOString() });
  }

  return { breachCount, riskCount, scanned };
}

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;

export function startSlaJob(intervalMs = 60_000) {
  if (timer || startupTimer) return;
  // Track the initial-run timeout so stopSlaJob can cancel it too —
  // otherwise a start/stop cycle within 5s still triggers one scan.
  startupTimer = setTimeout(async () => {
    startupTimer = null;
    try {
      await runSlaCheck();
    } catch (e) {
      console.error('SLA job error:', e);
    }
  }, 5_000);

  timer = setInterval(async () => {
    try {
      await runSlaCheck();
    } catch (e) {
      console.error('SLA job error:', e);
    }
  }, intervalMs);

  console.log(`SLA monitor started (every ${intervalMs / 1000}s)`);
}

export function stopSlaJob() {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Test hook: exposes whether any scheduled timer survives a stop(). */
export function slaJobTimersForTest(): { interval: NodeJS.Timeout | null; startup: NodeJS.Timeout | null } {
  return { interval: timer, startup: startupTimer };
}
