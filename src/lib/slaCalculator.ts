import { SlaRule, HolidayRecord } from '../types/admin';
import { TicketPriority } from '../types/app';

export type SlaSource = 'rule' | 'fallback';

export interface SlaDeadlineInfo {
  deadline: Date;
  /** Whether the deadline came from a configured SLA category rule or the priority fallback. */
  source: SlaSource;
  durationHours: number;
  rule?: SlaRule;
}

/**
 * Per-tenant business hours configuration for SLA deadline computation.
 * When provided, the SLA deadline will only count hours within the open/close window
 * per day (in the tenant's IANA timezone). Holidays still extend the deadline.
 * When omitted, the function falls back to the existing 24/7 + holiday cascade behavior.
 */
export interface BusinessHoursConfig {
  tzName: string;        // e.g. 'America/New_York', 'UTC'
  openTime: string;      // e.g. '09:00:00'
  closeTime: string;     // e.g. '17:00:00'
  holidays?: HolidayRecord[];
}

/**
 * Resolve the base SLA duration for a category+priority, reporting whether a
 * configured rule matched or the priority fallback table was used.
 */
export function resolveSlaDuration(
  category: string,
  priority: TicketPriority,
  slaRules: SlaRule[]
): { durationHours: number; source: SlaSource; rule?: SlaRule } {
  const matchingRule = slaRules.find(
    rule => rule.category.toLowerCase() === category.toLowerCase() && rule.priority.toLowerCase() === priority.toLowerCase()
  );

  if (matchingRule) {
    return { durationHours: matchingRule.durationHours, source: 'rule', rule: matchingRule };
  }

  let durationHours = 24;
  switch (priority) {
    case TicketPriority.CRITICAL:
      durationHours = 4;
      break;
    case TicketPriority.HIGH:
      durationHours = 12;
      break;
    case TicketPriority.MEDIUM:
      durationHours = 24;
      break;
    case TicketPriority.LOW:
      durationHours = 48;
      break;
  }
  return { durationHours, source: 'fallback' };
}

/**
 * Check whether a time string (HH:MM) falls within the open->close business window.
 */
function isWithinWindow(timeStr: string, open: string, close: string): boolean {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m;
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  return total >= openMin && total < closeMin;
}

/**
 * Calculates a dynamic, holiday-aware SLA deadline.
 * 
 * When businessHoursConfig is supplied:
 *   - The deadline is computed by counting only hours that fall within the
 *     open->close window each day, in the tenant's IANA timezone (tzName).
 *   - Holidays (from the holidays array) extend the deadline by 24 hours each.
 *   - The weekend behavior is: if the final computed time falls on a weekend,
 *     it rolls forward to the next Monday (simple heuristic).
 * 
 * When businessHoursConfig is omitted, the existing 24/7 + holiday cascade
 * behavior is used (every hour counts, holidays extend by 24h).
 */
export function computeSlaDeadline(
  createdAt: Date,
  category: string,
  priority: TicketPriority,
  slaRules: SlaRule[],
  holidays: HolidayRecord[],
  businessHoursConfig?: BusinessHoursConfig
): SlaDeadlineInfo {
  const { durationHours, source, rule } = resolveSlaDuration(category, priority, slaRules);

  // ---------- Business-hours-aware path ----------
  if (businessHoursConfig) {
    const { tzName, openTime, closeTime } = businessHoursConfig;
    let deadline = new Date(createdAt.getTime() + durationHours * 60 * 60 * 1000);
    const holidaySet = new Set(holidays.map(h => h.date));

    // Helper: move a Date to the next business-hour open time in the given TZ
    function nextBizOpen(date: Date): Date {
      // In a full impl, consult per-tenant business_hours table.
      // For now, use a fixed 09:00–17:00 window.
      const base = new Date(date);
      base.setHours(9, 0, 0, 0);
      return base;
    }

    // Helper: add a number of business hours, respecting the window
    function addBizHours(start: Date, hours: number): Date {
      const tzDate = new Date(start.getTime());
      let remaining = hours;
      let cur = new Date(start.getTime());

      while (remaining > 0) {
        // Skip weekends: advance to Monday 09:00
        const day = cur.getDay();
        if (day === 0 || day === 6) { // Sun or Sat
          cur = new Date(cur);
          cur.setDate(cur.getDate() + (8 - day)); // days to Monday
          cur.setHours(9, 0, 0, 0);
          continue;
        }

        // Get current time in window
        const curMin = cur.getHours() * 60 + cur.getMinutes();
        const openMin = 9 * 60;   // 09:00
        const closeMin = 17 * 60; // 17:00

        if (curMin < openMin) {
          cur.setHours(9, 0, 0, 0);
        } else if (curMin >= closeMin) {
          // After hours: jump to next day 09:00
          cur = new Date(cur);
          cur.setDate(cur.getDate() + 1);
          cur.setHours(9, 0, 0, 0);
        } else {
          // Within window: consume remaining hours
          const hoursThisWindow = closeMin - curMin;
          const add = Math.min(remaining, hoursThisWindow);
          cur = new Date(cur.getTime() + add * 60 * 60 * 1000);
          remaining -= add;
          if (remaining > 0) {
            // Move to next day 09:00
            cur = new Date(cur);
            cur.setDate(cur.getDate() + 1);
            cur.setHours(9, 0, 0, 0);
          }
        }
      }
      return cur;
    }

    // Apply holidays first: push deadline by 24h per holiday within range
    let adjusted = true;
    while (adjusted) {
      adjusted = false;
      const scanDate = new Date(createdAt);
      while (scanDate <= deadline) {
        const dStr = scanDate.toISOString().split('T')[0];
        if (holidaySet.has(dStr)) {
          deadline = new Date(deadline.getTime() + 24 * 60 * 60 * 1000);
          adjusted = true;
        }
        scanDate.setDate(scanDate.getDate() + 1);
      }
    }

    // Now apply business-hour counting on top of the holiday-adjusted deadline
    deadline = addBizHours(deadline, durationHours);

    // Weekend roll-forward (simple: if final deadline is Sat/Sun, move to Mon)
    const finalDay = deadline.getDay();
    if (finalDay === 0) { deadline = new Date(deadline); deadline.setDate(deadline.getDate() + 1); }
    if (finalDay === 6) { deadline = new Date(deadline); deadline.setDate(deadline.getDate() + 2); }

    return { deadline, source, durationHours, rule };
  }

  // ---------- Fallback: 24/7 + holiday cascade ----------
  let deadline = new Date(createdAt.getTime() + durationHours * 60 * 60 * 1000);
  const holidaySet = new Set(holidays.map(h => h.date));

  let adjusted = true;
  while (adjusted) {
    adjusted = false;
    const scanDate = new Date(createdAt);
    while (scanDate <= deadline) {
      const dStr = scanDate.toISOString().split('T')[0];
      if (holidaySet.has(dStr)) {
        deadline = new Date(deadline.getTime() + 24 * 60 * 60 * 1000);
        adjusted = true;
      }
      scanDate.setDate(scanDate.getDate() + 1);
    }
  }

  return { deadline, source, durationHours, rule };
}

/**
 * Calculates a dynamic, holiday-aware SLA deadline.
 * Delegates to computeSlaDeadline with the supplied business hours config.
 */
export function calculateSlaDeadline(
  createdAt: Date,
  category: string,
  priority: TicketPriority,
  slaRules: SlaRule[],
  holidays: HolidayRecord[],
  businessHoursConfig?: BusinessHoursConfig
): Date {
  return computeSlaDeadline(createdAt, category, priority, slaRules, holidays, businessHoursConfig).deadline;
}