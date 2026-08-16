import { SlaRule, HolidayRecord } from '../types/admin';
import { TicketPriority, TicketStatus, type TicketRecord } from '../types/app';

export type SlaSource = 'rule' | 'fallback';

/** True while the ticket's SLA clock is paused (waiting on an external party). */
export function isSlaPaused(ticket: Pick<TicketRecord, 'status' | 'slaPauseStartedAt'>): boolean {
  if (ticket.status !== TicketStatus.WAITING_CUSTOMER
    && ticket.status !== TicketStatus.WAITING_PARTNER
    && ticket.status !== TicketStatus.WAITING_INTERNAL) return false;
  return Boolean(ticket.slaPauseStartedAt);
}

/**
 * The deadline the SLA clock is actually measured against: the base deadline
 * shifted forward by all paused time (plus the ongoing pause when waiting).
 */
export function effectiveSlaDeadline(ticket: Pick<TicketRecord, 'slaDeadline' | 'slaPausedMs' | 'slaPauseStartedAt'> & { status?: TicketStatus }): Date {
  const base = new Date(ticket.slaDeadline).getTime();
  let pausedMs = ticket.slaPausedMs || 0;
  if (ticket.slaPauseStartedAt) {
    pausedMs += Math.max(0, Date.now() - new Date(ticket.slaPauseStartedAt).getTime());
  }
  return new Date(base + pausedMs);
}

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

// ─── Timezone-aware wall-clock helpers ─────────────────────────────────
// Business hours are defined in the tenant's local timezone (tzName). Date
// objects are UTC instants; converting to/from wall clock uses Intl so DST
// transitions are handled by the runtime's tz database.

interface WallClock {
  year: number; month: number; day: number; // month is 1-based
  hour: number; minute: number;
  weekday: number; // 0 = Sunday … 6 = Saturday
}

const wallFormatters = new Map<string, Intl.DateTimeFormat>();

function getWallFormatter(tzName: string): Intl.DateTimeFormat {
  let fmt = wallFormatters.get(tzName);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    wallFormatters.set(tzName, fmt);
  }
  return fmt;
}

/** The wall-clock time of a UTC instant inside tzName. */
function zonedWallClock(date: Date, tzName: string): WallClock {
  const parts = getWallFormatter(tzName).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: Math.max(0, weekdays.indexOf(get('weekday'))),
  };
}

/** The UTC instant of a wall-clock time inside tzName (DST-safe to ±1h). */
function wallClockToUtc(tzName: string, wall: WallClock, hour: number, minute: number): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, hour, minute);
  const asZoned = zonedWallClock(new Date(guess), tzName);
  const asUtc = Date.UTC(asZoned.year, asZoned.month - 1, asZoned.day, asZoned.hour, asZoned.minute);
  return new Date(guess - (asUtc - guess));
}

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

function nextDayOpen(tzName: string, wall: WallClock, openHm: string): Date {
  const open = parseHm(openHm);
  // Date.UTC normalizes month/day overflow, so day + 1 rolls over correctly.
  const next = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1, 12));
  const nextWall = zonedWallClock(next, tzName);
  return wallClockToUtc(tzName, nextWall, open.h, open.m);
}

/**
 * Consume `hours` of business time starting at `start`, in the tenant's
 * timezone. Only time inside the [open, close) window on non-weekend,
 * non-holiday days counts. Holidays and weekends simply contribute no
 * business time — no synthetic 24h extensions.
 */
function addBusinessHours(
  start: Date,
  hours: number,
  tzName: string,
  openTime: string,
  closeTime: string,
  holidaySet: Set<string>
): Date {
  const open = parseHm(openTime);
  const close = parseHm(closeTime);
  const openMin = open.h * 60 + open.m;
  const closeMin = close.h * 60 + close.m;
  const pad = (n: number) => String(n).padStart(2, '0');

  let cursor = new Date(start.getTime());
  let remainingMs = hours * 3_600_000;
  // Hard stop: even 48h over long holidays resolves in well under 1000 hops.
  let guard = 0;

  while (remainingMs > 0 && guard++ < 1000) {
    const wall = zonedWallClock(cursor, tzName);
    const dateStr = `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
    const isWeekend = wall.weekday === 0 || wall.weekday === 6;
    const isHoliday = holidaySet.has(dateStr);

    if (isWeekend || isHoliday) {
      cursor = nextDayOpen(tzName, wall, openTime);
      continue;
    }

    const curMin = wall.hour * 60 + wall.minute;
    if (curMin < openMin) {
      cursor = wallClockToUtc(tzName, wall, open.h, open.m);
      continue;
    }
    if (curMin >= closeMin) {
      cursor = nextDayOpen(tzName, wall, openTime);
      continue;
    }

    const availableMs = (closeMin - curMin) * 60_000;
    const consumeMs = Math.min(remainingMs, availableMs);
    cursor = new Date(cursor.getTime() + consumeMs);
    remainingMs -= consumeMs;
    // Loop re-evaluates: at close-of-day it jumps to the next business open.
  }

  return cursor;
}

/**
 * Calculates a dynamic, holiday-aware SLA deadline.
 *
 * When businessHoursConfig is supplied:
 *   - The deadline is computed by consuming only hours that fall within the
 *     open->close window, Monday-Friday, in the tenant's IANA timezone.
 *   - Holidays (tenant-local dates) contribute no business time.
 *
 * When businessHoursConfig is omitted, the legacy 24/7 + holiday cascade
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
    const holidaySet = new Set(holidays.map(h => h.date));
    const deadline = addBusinessHours(createdAt, durationHours, tzName, openTime, closeTime, holidaySet);
    return { deadline, source, durationHours, rule };
  }

  // ---------- Fallback: 24/7 + holiday cascade ----------
  let deadline = new Date(createdAt.getTime() + durationHours * 60 * 60 * 1000);
  const holidaySet = new Set(holidays.map(h => h.date));

  // Each distinct holiday inside [createdAt, deadline] extends the deadline
  // by 24h — exactly once. Without the applied-set this loops forever when a
  // holiday falls on the creation date (the scan restarts at createdAt each
  // pass and re-detects it indefinitely).
  const applied = new Set<string>();
  let adjusted = true;
  while (adjusted) {
    adjusted = false;
    const scanDate = new Date(createdAt);
    while (scanDate <= deadline) {
      const dStr = scanDate.toISOString().split('T')[0];
      if (holidaySet.has(dStr) && !applied.has(dStr)) {
        deadline = new Date(deadline.getTime() + 24 * 60 * 60 * 1000);
        applied.add(dStr);
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