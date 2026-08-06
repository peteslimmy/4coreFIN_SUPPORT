import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
}

/**
 * Service-role client for all data + admin operations. NEVER call
 * signInWithPassword on this client: supabase-js would attach the user session
 * to it and every subsequent data query would run under the user's role (RLS),
 * silently filtering rows. Admin-only, used server-side.
 */
export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Dedicated anon-key client used ONLY to verify credentials via
 * signInWithPassword. The user session it acquires is scoped to this client,
 * so the service client above is never contaminated.
 */
export const supabaseAuth = process.env.SUPABASE_ANON_KEY
  ? createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY)
  : supabase;
