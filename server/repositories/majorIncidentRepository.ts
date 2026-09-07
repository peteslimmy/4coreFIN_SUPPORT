import { supabase } from '../supabase';
import { type AuthUser } from '../compliance';
import { broadcast } from '../broadcast';
import { tenantScope, isPartner, partnerNameFor, toCamel, toSnake, GLOBAL_TENANT_ID } from './shared';

// ─── Major Incidents ───────────────────────────────────────────────────

export async function listMajorIncidents(user?: AuthUser) {
  let query = supabase.from('major_incidents')
    .select('*')
    .order('created_at', { ascending: false });
  if (user) {
    const tenantId = tenantScope(user);
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    } else if (isPartner(user)) {
      // Prefer partner_org_id FK (migration 044); fall back to partner name match
      if (user.partnerOrgId != null) {
        query = query.eq('partner_org_id', user.partnerOrgId);
      } else {
        query = query.ilike('partner', partnerNameFor(user));
      }
    }
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(toCamel);
}

/** Resolve a major incident's tenant from a ticket sharing its partner. */
async function majorIncidentTenantId(partner: string | undefined | null): Promise<string> {
  if (!partner) return GLOBAL_TENANT_ID;
  const { data } = await supabase
    .from('tickets')
    .select('tenant_id')
    .ilike('partner', partner)
    .limit(1)
    .maybeSingle();
  return data?.tenant_id || GLOBAL_TENANT_ID;
}

/** Load a single major incident enforcing the user's scope (tenant or partner). */
export async function getScopedMajorIncident(id: string, user: AuthUser): Promise<any | null> {
  let query = supabase.from('major_incidents').select('*').eq('id', id);
  const tenantId = tenantScope(user);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  } else if (isPartner(user)) {
    if (user.partnerOrgId != null) {
      query = query.eq('partner_org_id', user.partnerOrgId);
    } else {
      query = query.ilike('partner', partnerNameFor(user));
    }
  }
  const { data, error } = await query.single();
  if (error || !data) return null;
  return toCamel(data);
}

export async function upsertMajorIncident(mi: any) {
  const tenantId = mi.tenantId || (await majorIncidentTenantId(mi.partner));
  const row = toSnake({
    id: mi.id,
    tenantId,
    name: mi.name,
    description: mi.description || '',
    partner: mi.partner || '',
    category: mi.category || '',
    severity: mi.severity || 'MEDIUM',
    active: !!mi.active,
    ticketCount: mi.ticketCount || 0,
    createdAt: mi.createdAt,
    status: mi.status || 'INVESTIGATING',
    timeline: mi.timeline || [],
    notifications: mi.notifications || [],
    pir: mi.pir || null,
    declaredBy: mi.declaredBy || null,
    owner: mi.owner || null,
    affectedPartners: mi.affectedPartners || null,
    affectedBus: mi.affectedBus || null,
    impact: mi.impact || null,
    expectedRto: mi.expectedRto || null,
    severityJustification: mi.severityJustification || null,
    acknowledgedAt: mi.acknowledgedAt || null,
    resolvedAt: mi.resolvedAt || null,
    closedAt: mi.closedAt || null,
  });
  const { error } = await supabase.from('major_incidents').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertMajorIncident failed: ${error.message}`);
  broadcast('major_incident_updated', { id: mi.id }, tenantId);
}

/** Link an existing ticket to a major incident, upgrading to CRITICAL when severe. */
export async function linkTicketToMajorIncident(ticketId: string, miId: string, criticalUpgrade: boolean) {
  const row: Record<string, unknown> = { major_incident_id: miId };
  if (criticalUpgrade) row.priority = 'CRITICAL';
  const { error } = await supabase.from('tickets').update(row).eq('id', ticketId);
  if (error) throw new Error(`linkTicketToMajorIncident failed: ${error.message}`);
}
