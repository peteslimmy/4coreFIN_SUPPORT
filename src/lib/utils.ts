export { TICKET_STATUS_ORDER, TICKET_STATUS_LABELS, getTicketStatusStep, normalizeStatus } from './ticketStateMachine';

/**
 * Merge class names conditionally using clsx.
 */
export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

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
 * Compact h/m/s countdown for SLA displays, e.g. "10h 17m 00". Callers add
 * their own phrasing ("Left", "Breached -", ...) for consistency.
 */
export function formatSlaCountdown(fromMs: number, toMs: number): string {
  const diff = Math.abs(toMs - fromMs);
  const h = Math.floor(diff / MS_HOUR);
  const m = Math.floor((diff % MS_HOUR) / MS_MINUTE);
  const s = Math.floor((diff % MS_MINUTE) / 1000);
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}`;
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

/**
 * Scannable SLA countdown for card pills.
 * Returns object for flexible rendering, not pre-formatted string.
 */
export interface SlaCountdownParts {
  hours: number;
  minutes: number;
  seconds: number;
  isBreached: boolean;
  totalMinutes: number;
}

/** Parse ms into parts for granular rendering */
export function parseSlaCountdown(deadlineMs: number, nowMs = Date.now()): SlaCountdownParts {
  const diffMs = deadlineMs - nowMs;
  const absMs = Math.abs(diffMs);
  const hours = Math.floor(absMs / MS_HOUR);
  const minutes = Math.floor((absMs % MS_HOUR) / MS_MINUTE);
  const seconds = Math.floor((absMs % MS_MINUTE) / 1000);
  return {
    hours,
    minutes,
    seconds,
    isBreached: diffMs < 0,
    totalMinutes: Math.floor(absMs / MS_MINUTE),
  };
}

/** Human-friendly tiered format for pills */
export function formatSlaPillText(parts: SlaCountdownParts): string {
  const { hours, minutes, isBreached } = parts;
  if (isBreached) {
    if (hours > 0) return `−${hours}h ${minutes}m`;
    return `−${minutes}m`;
  }
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

/** Compact format for dense lists: "2h17m" or "−45m" */
export function formatSlaCompact(parts: SlaCountdownParts): string {
  const { hours, minutes, isBreached } = parts;
  const prefix = isBreached ? '−' : '';
  if (hours > 0) return `${prefix}${hours}h${minutes}m`;
  return `${prefix}${minutes}m`;
}

/** Full format for tooltips/modals: "2 hours 17 minutes remaining" */
export function formatSlaVerbose(parts: SlaCountdownParts): string {
  const { hours, minutes, seconds, isBreached } = parts;
  const unit = isBreached ? 'breached' : 'remaining';
  const chunks: string[] = [];
  if (hours > 0) chunks.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0 || hours > 0) chunks.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (chunks.length === 0) chunks.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return `${chunks.join(' ')} ${unit}`;
}
