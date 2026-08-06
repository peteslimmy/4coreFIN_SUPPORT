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
