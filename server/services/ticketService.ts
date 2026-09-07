import { listJsonTable } from '../repository';
import { computeSlaDeadline } from '../../shared/slaCalculator';
import { TicketPriority } from '../../src/types/app';
import type { SlaRule } from '../../src/types/admin';
import type { HolidayRecord } from '../../src/types/admin';

/**
 * Calculate the SLA deadline for a ticket. Looks up rules, holidays, and
 * partner organization data, then delegates to the SLA calculator.
 * Returns undefined when calculation is not possible (missing data).
 */
export async function calculateTicketSla(opts: {
  createdAt: Date;
  category: string;
  priority: string;
  partner?: string;
  partnerOrgId?: string;
}): Promise<{ deadline: string; policyVersion?: string } | undefined> {
  const [slaRules, holidays] = await Promise.all([
    listJsonTable('sla_rules'),
    listJsonTable('holidays'),
  ]);

  // Resolve partner organization FK if a partner name is given but no org ID.
  let resolvedPartnerOrgId = opts.partnerOrgId;
  if (opts.partner && !resolvedPartnerOrgId) {
    const partnerOrgs = await listJsonTable('partner_organizations');
    const org = partnerOrgs.find(o => o.name.toLowerCase() === opts.partner!.toLowerCase());
    resolvedPartnerOrgId = org?.id;
  }

  const slaInfo = computeSlaDeadline(
    opts.createdAt,
    opts.category || '',
    (opts.priority as TicketPriority) || TicketPriority.LOW,
    slaRules as SlaRule[],
    holidays as HolidayRecord[],
    undefined, // businessHoursConfig
    resolvedPartnerOrgId,
  );

  return {
    deadline: slaInfo.deadline.toISOString(),
    policyVersion: slaInfo.rule?.version,
  };
}
