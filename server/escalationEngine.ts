import { openTicketsForSla, insertNotification, getConfig } from './repository';
import { supabase } from './supabase';
import { broadcast } from './broadcast';
import { notifyByEmail, appHomeUrl } from './services/notifyEmails';
import { escapeHtml } from './lib/htmlSanitize';
import { buildId } from './lib/ids';

export interface EscalationAction {
  type: 'notify' | 'reassign' | 'escalate_priority';
  target?: string;
  message?: string;
}

export interface EscalationCondition {
  hoursFromCreation: number;
  priority?: string;
  category?: string;
}

export interface EscalationRule {
  id: string;
  name: string;
  condition: EscalationCondition;
  actions: EscalationAction[];
}

// ─── Deduplication ─────────────────────────────────────────────────────

const memoryClaims = new Map<string, number>();
const NOTIFICATION_TTL_MS = 6 * 3600000;

async function claimEscalation(ruleId: string, ticketId: string): Promise<boolean> {
  try {
    const builder: any = supabase
      .from('escalation_notification_log')
      .insert({ rule_id: ruleId, ticket_id: ticketId });
    if (typeof builder?.onConflict === 'function') {
      const { data, error } = await builder
        .onConflict('rule_id,ticket_id')
        .ignoreDuplicates(true)
        .select();
      if (!error) return Array.isArray(data) && data.length > 0;
    }
  } catch {
    // Table unavailable — fall through to memory dedupe.
  }
  const key = `${ruleId}:${ticketId}`;
  if (memoryClaims.has(key)) return false;
  memoryClaims.set(key, Date.now());
  return true;
}

async function pruneClaims(): Promise<void> {
  const cutoff = new Date(Date.now() - NOTIFICATION_TTL_MS).toISOString();
  try {
    const builder: any = supabase.from('escalation_notification_log').delete();
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

// ─── Core engine ───────────────────────────────────────────────────────

function hoursSinceCreation(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return (Date.now() - created) / 3600000;
}

function ruleMatches(rule: EscalationRule, ticket: any): boolean {
  const { condition } = rule;
  const hours = hoursSinceCreation(ticket.createdAt);
  if (hours < condition.hoursFromCreation) return false;
  if (condition.priority && ticket.priority !== condition.priority) return false;
  if (condition.category && ticket.category !== condition.category) return false;
  // Rule 3 (unassigned): no priority/category filter means any open ticket
  // that has been open long enough matches — the "unassigned" semantic is
  // handled by the rule's condition.hoursFromCreation only.
  return true;
}

// Overlap guard — see runSlaCheck in slaJob.ts.
let escalationRunInProgress = false;

export async function runEscalationCheck(): Promise<{ escalated: number; scanned: number }> {
  if (escalationRunInProgress) return { escalated: 0, scanned: 0 };
  escalationRunInProgress = true;
  try {
    return await runEscalationCheckInner();
  } finally {
    escalationRunInProgress = false;
  }
}

async function runEscalationCheckInner(): Promise<{ escalated: number; scanned: number }> {
  await pruneClaims();
  const tickets = await openTicketsForSla();
  const rules = await getConfig<EscalationRule[]>('escalationRules', []);

  let escalated = 0;
  let scanned = 0;

  for (const ticket of tickets) {
    scanned++;
    for (const rule of rules) {
      if (!ruleMatches(rule, ticket)) continue;

      // Check deduplication before performing any actions.
      if (!(await claimEscalation(rule.id, ticket.id))) continue;

      // Notify actions are independent — insert concurrently instead of
      // one round-trip per recipient.
      await Promise.all(rule.actions.map(async (action) => {
        if (action.type !== 'notify') return;
        const recipient = action.target || 'ops-team';
        const message = rule.name + (action.message ? `: ${action.message}` : '');
        const fullMessage = `[ESCALATION][${rule.id}] Ticket ${ticket.id}: ${message}`;

        try {
          await insertNotification({
            id: buildId('wn-esc'),
            timestamp: new Date().toISOString(),
            ticketId: ticket.id,
            message: fullMessage,
            recipient,
            seen: false,
          });
        } catch {
          // notification failure must not abort remaining actions
        }

        void notifyByEmail(
          recipient,
          `[4C] Escalation — Ticket ${escapeHtml(ticket.id)}`,
          `<h3>[ESCALATION] ${escapeHtml(rule.name)}</h3><p>Ticket <strong>${escapeHtml(ticket.id)}</strong> (${escapeHtml(ticket.priority || '')} / ${escapeHtml(ticket.category || '—')}) triggered escalation rule <strong>${escapeHtml(rule.id)}</strong>.</p><p>${escapeHtml(action.message || '')}</p><p><a href="${appHomeUrl()}">Open 4CoreFin</a></p>`
        );

        broadcast('escalation_triggered', {
          ruleId: rule.id,
          ticketId: ticket.id,
          message: fullMessage,
        }, ticket.tenantId);
      }));

      escalated++;
    }
  }

  return { escalated, scanned };
}

// ─── Scheduled job ─────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;

export function startEscalationJob(intervalMs = 120_000) {
  if (timer || startupTimer) return;
  // Track the initial-run timeout so stopEscalationJob can cancel it too —
  // otherwise a start/stop cycle within 10s still triggers one scan.
  startupTimer = setTimeout(async () => {
    startupTimer = null;
    try {
      await runEscalationCheck();
    } catch (e) {
      console.error('Escalation job error:', e);
    }
  }, 10_000);

  timer = setInterval(async () => {
    try {
      await runEscalationCheck();
    } catch (e) {
      console.error('Escalation job error:', e);
    }
  }, intervalMs);

  console.log(`Escalation engine started (every ${intervalMs / 1000}s)`);
}

export function stopEscalationJob() {
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
export function escalationJobTimersForTest(): { interval: NodeJS.Timeout | null; startup: NodeJS.Timeout | null } {
  return { interval: timer, startup: startupTimer };
}
