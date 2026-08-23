import { describe, it, expect, vi } from 'vitest';

vi.mock('../../server/supabase', () => {
  const s = { from: () => { throw new Error('not initialised'); } };
  return { supabase: s, supabaseAuth: s };
});

import { supabase } from '../../server/supabase';
import { recordSecurityEvent, listSecurityEvents } from '../../server/securityEvents';
import { createFakeSupabase, type TableStore } from '@/tests/helpers/fakeSupabase';

function seedStore(): TableStore {
  return {
    'security.events': [],
  };
}

describe('Security events service', () => {
  it('records a security event', async () => {
    const store = seedStore();
    Object.assign(supabase, createFakeSupabase(store));

    await recordSecurityEvent({
      eventType: 'LOGIN_SUCCESS',
      actorUserId: 'usr-1',
      actorEmail: 'test@example.com',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      metadata: { method: 'password' },
    });

    const events = await listSecurityEvents();
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe('LOGIN_SUCCESS');
    expect(events[0].actor_email).toBe('test@example.com');
    expect(events[0].ip_address).toBe('192.168.1.1');
  });

  it('records a login failure event', async () => {
    const store = seedStore();
    Object.assign(supabase, createFakeSupabase(store));

    await recordSecurityEvent({
      eventType: 'LOGIN_FAILURE',
      actorEmail: 'attacker@evil.com',
      ipAddress: '10.0.0.1',
      metadata: { reason: 'Invalid credentials' },
    });

    const events = await listSecurityEvents({ eventType: 'LOGIN_FAILURE' });
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe('LOGIN_FAILURE');
  });

  it('records an account lockout event', async () => {
    const store = seedStore();
    Object.assign(supabase, createFakeSupabase(store));

    await recordSecurityEvent({
      eventType: 'ACCOUNT_LOCKED',
      actorUserId: 'usr-1',
      actorEmail: 'user@example.com',
      metadata: { attempts: 5, lockoutMinutes: 15 },
    });

    const events = await listSecurityEvents({ actorEmail: 'user@example.com' });
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe('ACCOUNT_LOCKED');
  });

  it('handles errors silently (fire-and-forget)', async () => {
    // Force an error by making supabase throw
    Object.assign(supabase, {
      from: () => ({ insert: async () => ({ error: new Error('DB down') }) }),
    });

    // Should not throw
    await expect(
      recordSecurityEvent({ eventType: 'LOGIN_FAILURE' })
    ).resolves.toBeUndefined();
  });

  it('lists events with filtering', async () => {
    const store = seedStore();
    store['security.events'] = [
      { id: 'e1', event_type: 'LOGIN_SUCCESS', actor_user_id: 'usr-1', actor_email: 'a@b.com', ip_address: null, user_agent: null, metadata: {}, occurred_at: '2026-01-01T00:00:00Z' },
      { id: 'e2', event_type: 'LOGIN_FAILURE', actor_user_id: null, actor_email: 'x@y.com', ip_address: null, user_agent: null, metadata: {}, occurred_at: '2026-01-02T00:00:00Z' },
      { id: 'e3', event_type: 'LOGIN_SUCCESS', actor_user_id: 'usr-1', actor_email: 'a@b.com', ip_address: null, user_agent: null, metadata: {}, occurred_at: '2026-01-03T00:00:00Z' },
    ];
    Object.assign(supabase, createFakeSupabase(store));

    const allEvents = await listSecurityEvents();
    expect(allEvents.length).toBe(3);

    const successEvents = await listSecurityEvents({ eventType: 'LOGIN_SUCCESS' });
    expect(successEvents.length).toBe(2);

    const userEvents = await listSecurityEvents({ actorEmail: 'x@y.com' });
    expect(userEvents.length).toBe(1);
  });
});
