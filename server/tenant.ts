/**
 * Deterministic tenant id for a business unit.
 * Must stay in sync with the SQL function tenant_id_for_bu() in
 * supabase/migrations/009_tenant_isolation.sql.
 */
export function tenantIdForBu(bu: string | undefined | null): string {
  const clean = String(bu ?? '').trim();
  if (!clean) return 'tnt-global';
  return 'tnt-' + clean.toUpperCase().replace(/[^A-Za-z0-9]/g, '_');
}

export const GLOBAL_TENANT_ID = 'tnt-global';
