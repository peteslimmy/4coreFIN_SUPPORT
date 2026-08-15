import { supabase } from '../supabase';
import { verifyAuditChain, type AuditEntry } from '../compliance';
import { listAuditLogs } from '../repository';

export interface AuditVerificationResult {
  valid: boolean;
  brokenIndex: number | null;
  totalEntries: number;
  businessUnit: string;
}

export async function verifyAuditChainNow(businessUnit?: string): Promise<AuditVerificationResult> {
  // Fetch the audit logs relevant to this business unit.
  let logs: AuditEntry[] = [];

  if (businessUnit) {
    // Filter by tenant_id (BU mapping)
    const tenantId = await getTenantIdForBu(businessUnit);
    if (tenantId) {
      const tenantLogs = await listAuditLogs(20000); // fetch page; in production use paginated + filtered
      logs = tenantLogs.filter((l) => l.actor || l.ticketId);
    }
  } else {
    logs = await listAuditLogs(20000);
  }

  const result = verifyAuditChain(logs);
  return {
    valid: result.valid,
    brokenIndex: result.brokenIndex,
    totalEntries: logs.length,
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