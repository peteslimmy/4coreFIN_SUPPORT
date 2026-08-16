/**
 * Real-Supabase test database client + reset utilities.
 *
 * Integration tests no longer fake the Supabase client. They run against a
 * dedicated test project (see .env.test.example / scripts/prepareTestDb.ts) and
 * reset it between tests with the reset_test_schema() RPC added by
 * migration 041. A dedicated disposable project is required so that the reset
 * may safely wipe every row including auth.users; never point this at a
 * project that holds real data.
 */

import { supabase, supabaseAuth } from '../../server/supabase';

export { supabase, supabaseAuth };

/** The names of every public.table that reset_test_schema() clears. */
export const TEST_TABLES = [
  'webhook_deliveries',
  'webhooks',
  'landing_page_image_audit',
  'landing_page_image_versions',
  'landing_page_images',
  'idempotency_keys',
  'erasure_requests',
  'erasure_field_mappings',
  'audit_verification_log',
  'pii_encryption_keys',
  'business_hours',
  'partner_organizations',
  'audit_logs',
  'comments',
  'evidence',
  'watcher_notifications',
  'major_incidents',
  'tickets',
  'customers',
  'api_keys',
  'user_profiles',
  'users',
  'kb_articles',
  'ticket_templates',
  'holidays',
  'sla_rules',
  'app_config',
  'system_settings',
] as const;

export type TestTable = (typeof TEST_TABLES)[number];

/** Wipe everything test-relevant (tables + auth.users) for a clean baseline. */
export async function resetDatabase(): Promise<void> {
  const { error } = await supabase.rpc('reset_test_schema');
  if (error) {
    throw new Error(
      `reset_test_schema() failed: ${error.message}. ` +
        'Is migration 041 applied to the test project? Run: npm run test:prepare'
    );
  }
}

/** Upsert a tenant row (FK target for every tenant-scoped table). */
export async function ensureTenant(
  id: string,
  name: string,
  businessUnits: string[] = []
): Promise<void> {
  const { error } = await supabase
    .from('tenants')
    .upsert({ id, name, business_units: businessUnits }, { onConflict: 'id' });
  if (error) throw new Error(`ensureTenant(${id}) failed: ${error.message}`);
}

/** Insert one or more rows, throwing with a readable message on constraint errors. */
export async function insertRows(table: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) {
    throw new Error(
      `insert into ${table} failed: ${error.message} — row: ${JSON.stringify(rows[0])}`
    );
  }
}

/** Count rows in a table (sanity checks in tests). */
export async function countRows(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table} failed: ${error.message}`);
  return count ?? 0;
}

/** Read all rows from a table (used by tests to assert on stored state). */
export async function readRows(table: string): Promise<any[]> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw new Error(`read ${table} failed: ${error.message}`);
  return (data as any[]) ?? [];
}