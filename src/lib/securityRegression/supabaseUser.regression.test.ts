/**
 * Security regression — SEC-01 per-request user-JWT data access.
 *
 * The app-issued session JWT cannot authorize against Supabase; only the
 * caller's Supabase access token can. supabaseForUser() must:
 *   - build a client keyed by the ANON key carrying `Authorization: Bearer
 *     <user access token>` so RLS becomes the real authorization boundary
 *   - fall back to the service client only when no user token is available
 *     (session predating the sb-token cookie), with a visible warning
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://regression.supabase.co';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'anon-regression-key';
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ tag: 'user-jwt-client' })),
}));
vi.mock('../../../server/supabase', () => {
  const s = { from: () => { throw new Error('not initialised'); } };
  return { supabase: s, supabaseAuth: s };
});

import { supabaseForUser } from '../../../lib/server/supabaseUser';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../server/supabase';

beforeEach(() => {
  (createClient as unknown as ReturnType<typeof vi.fn>).mockClear();
});

describe('supabaseForUser (SEC-01)', () => {
  it('creates a client under the user access token so RLS applies', () => {
    const client = supabaseForUser('user-access-token');
    expect(createClient).toHaveBeenCalledWith(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: 'Bearer user-access-token' } } }
    );
    expect(client).toEqual({ tag: 'user-jwt-client' });
  });

  it('falls back to the service client (with a warning) when no user token exists', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const client = supabaseForUser(undefined);
      expect(client).toBe(supabase);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[SEC-01] user-JWT client unavailable; falling back to service client')
      );
    } finally {
      warn.mockRestore();
    }
  });
});
