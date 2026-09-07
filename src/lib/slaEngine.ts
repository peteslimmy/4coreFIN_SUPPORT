import { useMemo, useCallback } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';
import { TicketRecord, TicketStatus, TicketPriority } from '../types/app';
import { SlaRule, HolidayRecord } from '../types/admin';
import { useSlaTimer } from '../context/SlaTimerContext';

export interface SlaState {
  breached: boolean;
  atRisk: boolean;
  healthy: boolean;
  hoursLeft: number;
  minutesLeft: number;
  secondsLeft: number;
  totalSecondsLeft: number;
  formatted: string;
  formattedShort: string;
  source: 'rule' | 'fallback';
  deadline: Date | null;
}

export interface SlaEngineConfig {
  slaRules: SlaRule[];
  holidays: HolidayRecord[];
  priorityFallbackHours: Record<TicketPriority, number>;
}

const DEFAULT_FALLBACK: Record<TicketPriority, number> = {
  CRITICAL: 1,
  HIGH: 4,
  MEDIUM: 8,
  LOW: 24,
};

function isBusinessHour(date: Date, holidays: HolidayRecord[]): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const dateStr = date.toISOString().split('T')[0];
  return !holidays.some(h => h.date === dateStr);
}

function addBusinessHours(start: Date, hours: number, holidays: HolidayRecord[]): Date {
  const result = new Date(start.getTime());
  let remainingMs = hours * 60 * 60 * 1000;
  while (remainingMs > 0) {
    result.setTime(result.getTime() + Math.min(remainingMs, 60 * 60 * 1000));
    remainingMs -= 60 * 60 * 1000;
    if (!isBusinessHour(result, holidays)) {
      const nextDay = new Date(result);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(9, 0, 0, 0);
      while (!isBusinessHour(nextDay, holidays)) {
        nextDay.setDate(nextDay.getDate() + 1);
      }
      return addBusinessHours(nextDay, remainingMs / (60 * 60 * 1000), holidays);
    }
  }
  return result;
}

export function calculateSlaDeadline(
  ticket: TicketRecord,
  config: SlaEngineConfig
): { deadline: Date; source: 'rule' | 'fallback' } | null {
  if (!ticket.createdAt) return null;
  if (ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.RESOLVED) return null;

  const created = new Date(ticket.createdAt);
  const priority = (ticket.priority as TicketPriority) || TicketPriority.HIGH;

  const rule = config.slaRules.find(r =>
    r.category === ticket.category &&
    r.priority === priority &&
    (r.partnerOrgId === ticket.partner || !r.partnerOrgId)
  );

  if (rule) {
    const deadline = addBusinessHours(created, rule.durationHours, config.holidays);
    return { deadline, source: 'rule' };
  }

  const fallbackHours = config.priorityFallbackHours[priority] ?? DEFAULT_FALLBACK[priority];
  const deadline = addBusinessHours(created, fallbackHours, config.holidays);
  return { deadline, source: 'fallback' };
}

export function computeSlaState(
  ticket: TicketRecord,
  now: number,
  config: SlaEngineConfig
): SlaState {
  const deadlineInfo = calculateSlaDeadline(ticket, config);
  if (!deadlineInfo) {
    return {
      breached: false,
      atRisk: false,
      healthy: true,
      hoursLeft: 0,
      minutesLeft: 0,
      secondsLeft: 0,
      totalSecondsLeft: 0,
      formatted: 'N/A',
      formattedShort: 'N/A',
      source: 'fallback',
      deadline: null,
    };
  }

  const { deadline, source } = deadlineInfo;
  const deadlineMs = deadline.getTime();
  const diffMs = deadlineMs - now;

  if (diffMs <= 0) {
    const overdue = Math.abs(diffMs);
    const hours = Math.floor(overdue / (1000 * 60 * 60));
    const minutes = Math.floor((overdue % (1000 * 60 * 60)) / (1000 * 60));
    return {
      breached: true,
      atRisk: false,
      healthy: false,
      hoursLeft: 0,
      minutesLeft: 0,
      secondsLeft: 0,
      totalSecondsLeft: 0,
      formatted: `Breached ${hours}h ${minutes}m ago`,
      formattedShort: `Breached -${hours}h ${minutes}m`,
      source,
      deadline,
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const totalHours = diffMs / (1000 * 60 * 60);
  const breached = false;
  const atRisk = totalHours <= 4;
  const healthy = !atRisk;

  return {
    breached,
    atRisk,
    healthy,
    hoursLeft: hours,
    minutesLeft: minutes,
    secondsLeft: seconds,
    totalSecondsLeft: totalSeconds,
    formatted: `${hours}h ${minutes}m left`,
    formattedShort: `${hours}h ${minutes}m`,
    source,
    deadline,
  };
}

export function useSlaEngine(config: SlaEngineConfig) {
  const { now } = useSlaTimer();

  const compute = useCallback((ticket: TicketRecord) => computeSlaState(ticket, now, config), [now, config]);

  return { now, compute };
}

export function useSla(ticket: TicketRecord | null, config: SlaEngineConfig) {
  const { compute } = useSlaEngine(config);
  const state = useMemo(() => ticket ? compute(ticket) : null, [ticket, compute]);

  const springHours = useSpring(useMotionValue(state?.hoursLeft ?? 0), { stiffness: 120, damping: 20 });
  const springMinutes = useSpring(useMotionValue(state?.minutesLeft ?? 0), { stiffness: 120, damping: 20 });

  return {
    ...state,
    springHours,
    springMinutes,
  };
}

export function formatSlaCountdown(from: number, to: number): string {
  const diff = Math.abs(to - from);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}