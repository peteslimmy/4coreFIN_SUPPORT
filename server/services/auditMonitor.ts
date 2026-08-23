import { supabase } from '../supabase';
import { verifyAuditChainPaged } from '../repository';

export interface AuditVerificationResult {
  valid: boolean;
  brokenIndex: number | null;
  totalEntries: number;
  businessUnit: string;
}

export async function verifyAuditChainNow(businessUnit?: string): Promise<AuditVerificationResult> {
  // The ledger is globally linked, so verification always walks the full
  // chain. Paged streaming keeps memory flat regardless of ledger size; a
  // tenant-scoped partial slice could never validate a globally-chained
  // ledger, so the businessUnit argument is recorded for reporting only.
  const result = await verifyAuditChainPaged();
  return {
    valid: result.valid,
    brokenIndex: result.brokenIndex,
    totalEntries: result.checked,
    businessUnit: businessUnit || 'global',
  };
}

async function getTenantIdForBu(bu: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('tenant_id')
    .ilike('bu', bu)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.tenant_id || null;
}

/**
 * Run verification immediately and return the result.
 * Intended for one-off admin checks or immediate triggering.
 */
export function runVerificationNow(): Promise<AuditVerificationResult> {
  // Verify global chain (no BU filter)
  return verifyAuditChainNow(undefined);
}

/**
 * Retrieve the tenant ID for a given business unit name.
 * Used by the verification function to filter logs.
 */
export { getTenantIdForBu };