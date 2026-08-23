import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Regression coverage for Wave 3 fixes:
 *  - BUG-07: stopSlaJob/stopEscalationJob clear the initial startup timeout.
 */

describe('SLA/escalation job timer hygiene (BUG-07 regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('startSlaJob schedules an interval and a startup timeout', async () => {
    const { startSlaJob, slaJobTimersForTest } = await import('../../server/slaJob');
    startSlaJob(60_000);
    const t = slaJobTimersForTest();
    expect(t.interval).not.toBeNull();
    expect(t.startup).not.toBeNull();
  });

  it('stopSlaJob clears BOTH the interval and the startup timeout', async () => {
    const { startSlaJob, stopSlaJob, slaJobTimersForTest } = await import('../../server/slaJob');
    startSlaJob(60_000);
    stopSlaJob();
    // Advance past the 5s initial-run delay: with the fix the callback was
    // cancelled outright; before the fix one extra runSlaCheck fired here.
    vi.advanceTimersByTime(6_000);
    const t = slaJobTimersForTest();
    expect(t.interval).toBeNull();
    expect(t.startup).toBeNull();
  });

  it('stopEscalationJob clears BOTH the interval and the startup timeout', async () => {
    const { startEscalationJob, stopEscalationJob, escalationJobTimersForTest } = await import(
      '../../server/escalationEngine'
    );
    startEscalationJob(120_000);
    stopEscalationJob();
    vi.advanceTimersByTime(11_000);
    const t = escalationJobTimersForTest();
    expect(t.interval).toBeNull();
    expect(t.startup).toBeNull();
  });

  it('allows a clean start/stop/restart cycle for both jobs', async () => {
    const sla = await import('../../server/slaJob');
    const esc = await import('../../server/escalationEngine');

    sla.startSlaJob(60_000);
    sla.stopSlaJob();
    sla.startSlaJob(60_000);
    expect(sla.slaJobTimersForTest().interval).not.toBeNull();
    sla.stopSlaJob();

    esc.startEscalationJob(120_000);
    esc.stopEscalationJob();
    esc.startEscalationJob(120_000);
    expect(esc.escalationJobTimersForTest().interval).not.toBeNull();
    esc.stopEscalationJob();
  });
});
