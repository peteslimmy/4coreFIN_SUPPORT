/**
 * Admin (service-role) Supabase client. Split from server/supabase.ts so the
 * RLS-bypassing client is importable under a distinct, greppable name —
 * SEC-01 policy: regular request paths must use supabaseForUser() instead.
 *
 * Lazily constructed (proxy) because Next.js imports route modules at build
 * time for page-data collection, when env vars may be absent.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

function build(): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY!;
  return createClient(url, key);
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!adminClient) adminClient = build();
    return adminClient[prop as keyof SupabaseClient];
  },
  set(_target, prop, value) {
    if (!adminClient) adminClient = build();
    (adminClient as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  },
});
