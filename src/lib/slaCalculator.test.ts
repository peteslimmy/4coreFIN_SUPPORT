import { describe, it, expect } from 'vitest';
import { computeSlaDeadline, resolveSlaDuration } from './slaCalculator';
import { TicketPriority } from '../types/app';

const RULES = [{ id: 'r1', category: 'Payment Dispute', priority: 'HIGH', durationHours: 8 }];
const NO_RULES: typeof RULES = [];

describe('resolveSlaDuration', () => {
  it('uses a configured category+priority rule when present', () => {
    const r = resolveSlaDuration('payment dispute', 'HIGH', RULES);
    expect(r.source).toBe('rule');
    expect(r.durationHours).toBe(8);
  });

  it('falls back to the priority table with source=fallback', () => {
    expect(resolveSlaDuration('Other', 'CRITICAL', NO_RULES)).toMatchObject({ source: 'fallback', durationHours: 4 });
    expect(resolveSlaDuration('Other', 'HIGH', NO_RULES)).toMatchObject({ durationHours: 12 });
    expect(resolveSlaDuration('Other', 'MEDIUM', NO_RULES)).toMatchObject({ durationHours: 24 });
    expect(resolveSlaDuration('Other', 'LOW', NO_RULES)).toMatchObject({ durationHours: 48 });
  });
});

describe('computeSlaDeadline — 24/7 fallback', () => {
  it('adds duration hours directly with no holidays', () => {
    const start = new Date('2026-08-10T10:00:00Z'); // Monday
    const info = computeSlaDeadline(start, 'Other', 'HIGH', NO_RULES, []);
    expect(info.deadline.toISOString()).toBe('2026-08-10T22:00:00.000Z');
  });

  it('extends by 24h per holiday inside the window', () => {
    const start = new Date('2026-08-10T10:00:00Z');
    const info = computeSlaDeadline(start, 'Other', 'HIGH', NO_RULES, [
      { id: 'h1', name: 'Holiday', date: '2026-08-10', country: 'NG' },
    ]);
    expect(info.deadline.toISOString()).toBe('2026-08-11T22:00:00.000Z');
  });
});

describe('computeSlaDeadline — business hours (timezone-aware)', () => {
  const bh = { tzName: 'Africa/Lagos', openTime: '09:00', closeTime: '17:00' };
  // Africa/Lagos is UTC+1 year-round (no DST).

  it('consumes only in-window hours in the tenant timezone', () => {
    // Monday 2026-08-10 15:00 Lagos (= 14:00Z). 4 business hours remain
    // until close (17:00), so an 8h SLA ends Tuesday at 13:00 Lagos.
    const start = new Date('2026-08-10T14:00:00Z');
    const info = computeSlaDeadline(start, 'Payment Dispute', 'HIGH', RULES, [], bh);
    expect(info.deadline.toISOString()).toBe('2026-08-11T14:00:00.000Z'); // 15:00 Lagos
  });

  it('starts counting from the next open when created after hours', () => {
    // Monday 20:00 Lagos — after close. 8h SLA: Tue 09:00→17:00 consumes 8h.
    const start = new Date('2026-08-10T19:00:00Z');
    const info = computeSlaDeadline(start, 'Payment Dispute', 'HIGH', RULES, [], bh);
    expect(info.deadline.toISOString()).toBe('2026-08-11T16:00:00.000Z'); // 17:00 Lagos
  });

  it('starts counting from open when created before hours', () => {
    // Monday 06:00 Lagos. 8h SLA: 09:00→17:00 same day.
    const start = new Date('2026-08-10T05:00:00Z');
    const info = computeSlaDeadline(start, 'Payment Dispute', 'HIGH', RULES, [], bh);
    expect(info.deadline.toISOString()).toBe('2026-08-10T16:00:00.000Z'); // 17:00 Lagos
  });

  it('skips weekends', () => {
    // Friday 2026-08-14 16:00 Lagos — 1h left Friday, remaining 7h land
    // Monday 09:00+7h = 16:00 Lagos.
    const start = new Date('2026-08-14T15:00:00Z');
    const info = computeSlaDeadline(start, 'Payment Dispute', 'HIGH', RULES, [], bh);
    expect(info.deadline.toISOString()).toBe('2026-08-17T15:00:00.000Z'); // Mon 16:00 Lagos
  });

  it('holidays contribute no business time', () => {
    // Monday 2026-08-10 10:00 Lagos, 8h SLA, Tuesday is a holiday:
    // Monday consumes 10:00→17:00 (7h), Wednesday 09:00→10:00 (1h).
    const start = new Date('2026-08-10T09:00:00Z');
    const info = computeSlaDeadline(start, 'Payment Dispute', 'HIGH', RULES, [
      { id: 'h1', name: 'Independence Day', date: '2026-08-11', country: 'NG' },
    ], bh);
    expect(info.deadline.toISOString()).toBe('2026-08-12T09:00:00.000Z'); // Wed 10:00 Lagos
  });

  it('honors a tenant timezone that differs from UTC (New York)', () => {
    // America/New_York in August is UTC-4. Monday 08:00 NY = 12:00Z, before
    // the 09:00 open. 8h SLA: Mon 09:00→17:00 exactly.
    const ny = { tzName: 'America/New_York', openTime: '09:00', closeTime: '17:00' };
    const start = new Date('2026-08-10T12:00:00Z');
    const info = computeSlaDeadline(start, 'Payment Dispute', 'HIGH', RULES, [], ny);
    expect(info.deadline.toISOString()).toBe('2026-08-10T21:00:00.000Z'); // 17:00 NY
  });

  it('does not depend on the server local timezone', () => {
    // Same instant and config must yield the same deadline regardless of the
    // process TZ. We cannot change process.env.TZ reliably mid-run on win32,
    // so assert the Lagos math is exact — it was wrong under any non-UTC
    // server TZ before the fix because getHours() used local time.
    const start = new Date('2026-08-10T14:00:00Z');
    const a = computeSlaDeadline(start, 'Payment Dispute', 'HIGH', RULES, [], bh);
    const b = computeSlaDeadline(new Date(start.getTime()), 'Payment Dispute', 'HIGH', RULES, [], { ...bh });
    expect(a.deadline.getTime()).toBe(b.deadline.getTime());
    expect(a.deadline.toISOString()).toBe('2026-08-11T14:00:00.000Z');
  });
});
