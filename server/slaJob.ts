import { audit, AuditAction } from './auditEvents';
import { openTicketsForSla, insertNotification, getConfig } from './repository';
import { supabase } from './supabase';
import { resolveSlaDuration, effectiveSlaDeadline } from '../shared/slaCalculator';
import { TicketPriority } from '../src/types/app';
import { broadcast } from './broadcast';
import { dispatchWebhook } from './services/webhookDispatcher';
import { notifyByEmail, appHomeUrl } from './services/notifyEmails';
import { escapeHtml } from './lib/htmlSanitize';
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

// Multi-instance guard (audit fix): an in-process flag cannot stop a second
// replica from scanning concurrently. A session-level Postgres advisory lock
// serializes scans across ALL instances; a replica that cannot acquire the
// lock skips its tick. The lock is released when the connection closes.
const SLA_JOB_LOCK_KEY = 0x534c414a; // 'SLAJ'
let lockConnection: { query: (sql: string) => Promise<unknown>; release?: () => void } | null = null;

async function acquireJobLock(): Promise<boolean> {
  try {
    const { Client } = await import('pg');
    if (!process.env.DATABASE_URL) return true; // no direct DB — best-effort
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const res = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [SLA_JOB_LOCK_KEY]);
    if (!res.rows?.[0]?.ok) {
      await client.end().catch(() => {});
      return false;
    }
    lockConnection = client as unknown as typeof lockConnection;
    return true;
  } catch {
    return true; // lock infrastructure unavailable — degrade to per-process guard
  }
}

async function releaseJobLock(): Promise<void> {
  if (!lockConnection) return;
  const client = lockConnection as unknown as {
    query: (sql: string, values?: unknown[]) => Promise<unknown>;
    end: () => Promise<void>;
  };
  lockConnection = null;
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [SLA_JOB_LOCK_KEY]);
    await client.end();
  } catch {
    /* connection already gone — lock dies with the session */
  }
}

export async function runSlaCheck() {
  if (slaRunInProgress) return;
  slaRunInProgress = true;
  try {
    if (!(await acquireJobLock())) return;
    try {
      await runSlaCheckInner();
    } finally {
      await releaseJobLock();
    }
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

      // Recipients are scoped to the ticket's context (audit fix: every
      // breach previously fanned out to ALL configured notification emails —
      // alert fatigue and a cross-BU information leak). Only watchers,
      // the assigned agent, and configs explicitly targeting this ticket's
      // BU/partner are notified.
      const ticketBu = String(t.businessUnit || '').toLowerCase();
      const ticketPartner = String(t.partner || '').toLowerCase();
      for (const c of configs as Array<{ id?: string; stage?: string; email?: string; businessUnit?: string; partner?: string; bu?: string }>) {
        if (!c.email) continue;
        const cBu = String(c.businessUnit || c.bu || '').toLowerCase();
        const cPartner = String(c.partner || '').toLowerCase();
        const matches = (!cBu || cBu === ticketBu) && (!cPartner || cPartner === ticketPartner);
        if (matches) recipients.add(c.email);
      }
      for (const w of t.watchers || []) {
        if (w) recipients.add(w);
      }

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
            `[4C] SLA Breach — Ticket ${escapeHtml(t.id)}`,
            `<h3>[SLA_BREACH] Ticket ${escapeHtml(t.id)}</h3><p>Ticket <strong>${escapeHtml(t.id)}</strong> breached its SLA deadline (<strong>${escapeHtml(t.priority || '')}</strong> / ${escapeHtml(t.category || '—')}). Immediate action is required.</p><p><strong>Deadline:</strong> ${escapeHtml(String(t.slaDeadline || '—'))}</p><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`
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
            `[4C] SLA At Risk — Ticket ${escapeHtml(t.id)}`,
            `<h3>[SLA_AT_RISK] Ticket ${escapeHtml(t.id)}</h3><p>Ticket <strong>${escapeHtml(t.id)}</strong> is at risk — <strong>${hoursLeft.toFixed(1)}h</strong> remaining before SLA breach (<strong>${escapeHtml(t.priority || '')}</strong> / ${escapeHtml(t.category || '—')}).</p><p><strong>Deadline:</strong> ${escapeHtml(String(t.slaDeadline || '—'))}</p><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`
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
