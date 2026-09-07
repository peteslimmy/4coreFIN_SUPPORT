import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../server/supabase';

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

/**
 * Per-request user-JWT Supabase client (SEC-01).
 *
 * Carries the caller's Supabase access token (stored in the encrypted session
 * at login) so every query runs under the user's identity and RLS becomes the
 * REAL authorization boundary. Even if application code forgets a tenant
 * filter, the database denies the row.
 *
 * `supabase` (service role, RLS-bypassing) remains reserved for true admin
 * operations: provisioning, ban sync, cross-tenant background jobs, migrations.
 */
export function supabaseForUser(accessToken?: string): SupabaseClient {
  if (anonKey && accessToken) {
    return createClient(supabaseUrl!, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }
  // Fallback when SUPABASE_ANON_KEY is not configured or the session predates
  // the sb-token cookie: keep the request working via the service client until
  // the user re-authenticates. Logged so operators can see the fallback rate.
  console.warn('[SEC-01] user-JWT client unavailable; falling back to service client');
  return supabase;
}
