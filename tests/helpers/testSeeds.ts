/**
 * Fixture builders for the integration tests.
 *
 * Tests seed rows directly through the service client (RLS bypassed). These
 * helpers exist so the 11 migrated test files can keep their existing fixture
 * shapes — each builder only fills in the NOT NULL columns that the real schema
 * requires (tenant_id, sla_deadline, role, …) and passes everything else
 * through unchanged.
 */

import { ensureTenantForBu } from '../../server/repository';
import { tenantIdForBu, GLOBAL_TENANT_ID } from '../../server/tenant';

export interface TicketFixture {
  id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_last_name?: string;
  customer_id?: string;
  business_unit?: string;
  provider?: string;
  category?: string;
  issue_type?: string;
  priority?: string;
  status?: string;
  amount?: number;
  transaction_id?: string;
  card_pan?: string;
  description?: string;
  created_at?: string;
  sla_deadline?: string;
  is_escalated?: boolean;
  escalation_count?: number;
  assigned_agent_id?: string;
  major_incident_id?: string;
  feedback_score?: number;
  feedback_comment?: string;
  root_cause?: string;
  corrective_action?: string;
  submitted_by?: string;
  submitted_by_name?: string;
  submitted_by_phone?: string;
  is_deleted?: boolean;
  watchers?: unknown;
  rca_details?: unknown;
  tenant_id?: string;
  [key: string]: unknown;
}

export async function withTenantId(bu: string | undefined): Promise<string | undefined> {
  if (!bu) return GLOBAL_TENANT_ID;
  const tenantId = tenantIdForBu(bu);
  if (tenantId !== GLOBAL_TENANT_ID) {
    await ensureTenantForBu(bu);
  }
  return tenantId;
}

/** Build a full tickets-row for the real schema. */
export async function ticketRow(fixture: TicketFixture): Promise<Record<string, unknown>> {
  const bu = fixture.business_unit || 'ALPHA';
  const tenantId = await withTenantId(bu);
  return {
    id: fixture.id,
    customer_name: fixture.customer_name ?? 'Test Customer',
    customer_email: fixture.customer_email ?? 'customer@example.com',
    customer_phone: fixture.customer_phone ?? '',
    customer_last_name: fixture.customer_last_name ?? '',
    customer_id: fixture.customer_id ?? null,
    business_unit: bu,
    partner: fixture.provider ?? 'PROVIDER_1',
    category: fixture.category ?? 'PAYMENT',
    issue_type: fixture.issue_type ?? 'FAILED_PAYMENT',
    priority: fixture.priority ?? 'HIGH',
    status: fixture.status ?? 'OPEN',
    amount: fixture.amount ?? 0,
    transaction_id: fixture.transaction_id ?? '',
    card_pan: fixture.card_pan ?? '',
    description: fixture.description ?? '',
    created_at: fixture.created_at ?? new Date().toISOString(),
    sla_deadline: fixture.sla_deadline ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    is_escalated: fixture.is_escalated ?? false,
    escalation_count: fixture.escalation_count ?? 0,
    assigned_agent_id: fixture.assigned_agent_id ?? '',
    major_incident_id: fixture.major_incident_id ?? null,
    feedback_score: fixture.feedback_score ?? null,
    feedback_comment: fixture.feedback_comment ?? null,
    root_cause: fixture.root_cause ?? null,
    corrective_action: fixture.corrective_action ?? null,
    submitted_by: fixture.submitted_by ?? 'BU_SUPPORT',
    submitted_by_name: fixture.submitted_by_name ?? '',
    submitted_by_phone: fixture.submitted_by_phone ?? '',
    is_deleted: fixture.is_deleted ?? false,
    watchers: fixture.watchers ?? [],
    rca_details: fixture.rca_details ?? null,
    tenant_id: fixture.tenant_id ?? tenantId,
  };
}

/**
 * Resolve author/actor names to a tenant_id when a ticket_id is not available.
 * Used for audit_logs and comments fixtures.
 */
export async function tenantForActorOrGlobal(bu?: string): Promise<string> {
  return (await withTenantId(bu)) ?? GLOBAL_TENANT_ID;
}

export type AnyRow = Record<string, unknown>;

export { ensureTenantForBu, tenantIdForBu, GLOBAL_TENANT_ID };