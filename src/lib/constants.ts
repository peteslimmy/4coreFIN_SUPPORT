/** Shared application constants — prevents magic-number drift */

/** Milliseconds in one hour */
export const HOUR_MS = 3_600_000;

/** SLA at-risk threshold — percentage of elapsed time before a ticket is flagged "At Risk" */
export const SLA_AT_RISK_PCT = 75;

/** How often the ticket list SLA badges refresh (ms) */
export const SLA_LIST_REFRESH_MS = 30_000;

/** Priority values used across the ticket domain */
export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Email validation regex */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (v: string): boolean => EMAIL_RE.test(v);

/** Default SLA duration used when a ticket's createdAt is absent (24 h in ms) */
export const FALLBACK_SLA_DURATION_MS = 24 * HOUR_MS;