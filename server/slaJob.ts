import { openTicketsForSla, insertNotification, appendAuditLog, listNotifications, getConfig } from './repository';
import { broadcast } from './broadcast';

let timer: NodeJS.Timeout | null = null;
const notifiedMap = new Map<string, number>(); // key -> timestamp
const NOTIFICATION_TTL = 6 * 3600000; // 6 hours

function pruneNotifiedMap() {
  const now = Date.now();
  for (const [key, ts] of notifiedMap) {
    if (now - ts > NOTIFICATION_TTL) notifiedMap.delete(key);
  }
}

async function alreadyNotified(activeKeys: Set<string>, ticketId: string, kind: string, recipient: string): Promise<boolean> {
  return notifiedMap.has(`${kind}:${ticketId}:${recipient}`) || activeKeys.has(`${kind}:${ticketId}:${recipient}`);
}

function markNotified(ticketId: string, kind: string, recipient: string) {
  const key = `${kind}:${ticketId}:${recipient}`;
  notifiedMap.set(key, Date.now());
}

export async function runSlaCheck() {
  pruneNotifiedMap();
  const tickets = await openTicketsForSla();
  const configs = await getConfig<Array<{ id: string; stage: string; email: string }>>('notificationConfigs', []);

  // Snapshot recent notifications once so duplicate detection does not trigger a
  // full-table scan per (ticket × recipient × kind) on every run.
  const activeKeys = new Set<string>();
  const recent = await listNotifications();
  const now = Date.now();
  for (const n of recent) {
    if (now - new Date(n.timestamp).getTime() < 6 * 3600000) {
      for (const kind of ['SLA_BREACH', 'SLA_AT_RISK']) {
        if (n.message.includes(kind)) activeKeys.add(`${kind}:${n.ticketId}:${n.recipient}`);
      }
    }
  }

  let breachCount = 0;
  let riskCount = 0;
  let scanned = 0;

  for (const t of tickets) {
    scanned++;
    try {
      const deadline = new Date(t.slaDeadline).getTime();
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

      if (hoursLeft < 0 && !t.isEscalated) {
        for (const recipient of recipients) {
          if (await alreadyNotified(activeKeys, t.id, 'SLA_BREACH', recipient)) continue;
          await insertNotification({
            id: 'wn-sla-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            timestamp: new Date().toISOString(),
            ticketId: t.id,
            message: `[SLA_BREACH] Ticket ${t.id} breached SLA deadline (${t.priority} / ${t.category}). Immediate action required.`,
            recipient,
            seen: false,
          });
          markNotified(t.id, 'SLA_BREACH', recipient);
        }
        // Audit the breach once per ticket, not on every monitor tick.
        if (!(await alreadyNotified(activeKeys, t.id, 'SLA_BREACH', '__audit__'))) {
          await appendAuditLog({
            ticketId: t.id,
            actor: 'SYSTEM',
            role: 'SYSTEM',
            action: 'SLA_BREACH_DETECTED',
            details: `Automated SLA monitor detected breach for ticket ${t.id}. Deadline was ${t.slaDeadline}.`,
          });
          markNotified(t.id, 'SLA_BREACH', '__audit__');
        }
        breachCount++;
        broadcast('sla_breach', { ticketId: t.id, slaDeadline: t.slaDeadline }, t.tenant_id);
      } else if (hoursLeft >= 0 && hoursLeft < 3) {
        for (const recipient of recipients) {
          if (await alreadyNotified(activeKeys, t.id, 'SLA_AT_RISK', recipient)) continue;
          await insertNotification({
            id: 'wn-risk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            timestamp: new Date().toISOString(),
            ticketId: t.id,
            message: `[SLA_AT_RISK] Ticket ${t.id} is at risk — ${hoursLeft.toFixed(1)}h remaining before SLA breach.`,
            recipient,
            seen: false,
          });
          markNotified(t.id, 'SLA_AT_RISK', recipient);
        }
        riskCount++;
        broadcast('sla_at_risk', { ticketId: t.id, hoursLeft }, t.tenant_id);
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

export function startSlaJob(intervalMs = 60_000) {
  if (timer) return;
  setTimeout(async () => {
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
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
