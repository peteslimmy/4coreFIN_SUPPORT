import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Clients are created lazily: Next.js imports route modules at BUILD time to
 * collect page data, and module-scope createClient() would throw when env
 * vars are absent in the build environment. A proxy keeps every existing
 * call site working while deferring construction to first use.
 */

let serviceClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

function env(): { url: string; serviceKey: string } | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

/**
 * Service-role client for all data + admin operations. NEVER call
 * signInWithPassword on this client: supabase-js would attach the user session
 * to it and every subsequent data query would run under the user's role (RLS),
 * silently filtering rows. Admin-only, used server-side.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!serviceClient) {
      const e = env();
      if (!e) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
      }
      serviceClient = createClient(e.url, e.serviceKey);
    }
    return serviceClient[prop as keyof SupabaseClient];
  },
  set(_target, prop, value) {
    if (!serviceClient) {
      const e = env();
      if (!e) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
      serviceClient = createClient(e.url, e.serviceKey);
    }
    (serviceClient as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  },
});

/**
 * Dedicated anon-key client used ONLY to verify credentials via
 * signInWithPassword. The user session it acquires is scoped to this client,
 * so the service client above is never contaminated.
 */
export const supabaseAuth: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!authClient) {
      const e = env();
      if (!e) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
      }
      authClient = process.env.SUPABASE_ANON_KEY
        ? createClient(e.url, process.env.SUPABASE_ANON_KEY)
        : supabase;
    }
    return authClient[prop as keyof SupabaseClient];
  },
});
