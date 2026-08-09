export { TICKET_STATUS_ORDER, TICKET_STATUS_LABELS, getTicketStatusStep, normalizeStatus } from './ticketStateMachine';

/**
 * Format a number as Nigerian Naira currency.
 * @param amount - The amount in Naira (e.g., 1250000)
 * @returns Formatted string like "₦1,250,000.00"
 */
export function formatCurrency(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a number as compact Nigerian Naira currency for charts/dashboards.
 * @param amount - The amount in Naira
 * @returns Formatted string like "₦1.3M" or "₦450k"
 */
export function formatCurrencyCompact(amount: number): string {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `₦${(amount / 1_000).toFixed(0)}k`;
  return `₦${amount.toFixed(0)}`;
}

// Ticket lifecycle progress helpers are canonically defined in
// ./ticketStateMachine and re-exported above. The machine is the single
// source of truth for status ordering and progress-step mapping so the
// ProgressWizard and state transitions can never drift apart.

const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

/**
 * Format the time between two dates as a compact "3 days" / "8 hours" /
 * "45 mins" string, rounding to the largest sensible unit.
 */
export function formatSlaDuration(fromMs: number, toMs: number): string {
  const diff = Math.abs(toMs - fromMs);
  if (diff >= MS_DAY) {
    const days = Math.floor(diff / MS_DAY);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (diff >= MS_HOUR) {
    const hours = Math.floor(diff / MS_HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (diff >= MS_MINUTE) {
    const mins = Math.floor(diff / MS_MINUTE);
    return `${mins} min${mins === 1 ? '' : 's'}`;
  }
  return 'just now';
}

/**
 * Sign-aware SLA label: when `deadlineMs < now` returns a breach label such as
 * "Breached -2 days" / "Breached -8 hours"; otherwise "On Track · 5 hours".
 */
export function formatSlaDeadline(deadlineMs: number, nowMs = Date.now()): string {
  const diffMs = deadlineMs - nowMs;
  const duration = formatSlaDuration(nowMs, deadlineMs);
  if (diffMs < 0) return `Breached -${duration}`;
  return `${duration} remaining`;
}
