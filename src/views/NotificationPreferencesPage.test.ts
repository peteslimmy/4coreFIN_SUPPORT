import { describe, it, expect } from 'vitest';
import { buildPayload, DEFAULT_PREFS, type PrefSections } from '../lib/notificationPreferences';

/**
 * FE-03 regression: the notification page must never flat-spread its six
 * preference sections into the PUT payload (in-app keys with identical names
 * used to overwrite email keys, and general prefs overwrote ticket prefs).
 * buildPayload returns a namespaced payload — verify the semantics here so a
 * future refactor cannot silently reintroduce the data-loss bug.
 */

function samplePrefs(): PrefSections {
  return JSON.parse(JSON.stringify(DEFAULT_PREFS)) as PrefSections;
}

describe('Notification preferences payload (FE-03)', () => {
  it('namespaces each channel so identical keys never overwrite each other', () => {
    const p = samplePrefs();
    // Introduce deliberately conflicting values across channels.
    p.email.notifyOnTicketUpdate = false;
    p.inApp.notifyOnTicketUpdate = true;
    p.general.notifyOnStatusChange = false;
    p.ticket.notifyOnStatusChange = true;

    const payload = buildPayload(p) as { details: Record<string, Record<string, unknown>> };

    // The conflicting keys must retain their OWN channel's value.
    expect(payload.details.email.notifyOnTicketUpdate).toBe(false); // email said false
    expect(payload.details.inApp.notifyOnTicketUpdate).toBe(true); // in-app said true (NOT clobbered)
    expect(payload.details.general.notifyOnStatusChange).toBe(false);
    expect(payload.details.ticket.notifyOnStatusChange).toBe(true); // NOT clobbered by general

    expect(payload.details.email).not.toBe(payload.details.inApp); // distinct objects
    expect(Object.keys(payload.details).sort()).toEqual(['email', 'general', 'inApp', 'sms', 'system', 'ticket']);
  });

  it('keeps the first-class channel flags in sync with the details namespaces', () => {
    const p = samplePrefs();
    const payload = buildPayload(p) as { emailEnabled: boolean; smsEnabled: boolean; pushEnabled: boolean; quietHours: unknown };

    expect(payload.emailEnabled).toBe(p.email.emailEnabled);
    expect(payload.smsEnabled).toBe(p.sms.smsEnabled);
    expect(payload.pushEnabled).toBe(p.inApp.inAppEnabled);
    expect(payload.quietHours).toEqual({
      enabled: p.general.quietHoursEnabled,
      start: p.general.quietHoursStart,
      end: p.general.quietHoursEnd,
    });
  });
});