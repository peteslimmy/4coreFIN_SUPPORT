import { supabase } from '../supabase';
import { type AuthUser } from '../compliance';
import { decrypt } from '../services/encryptionService';
import { tenantIdForBu, GLOBAL_TENANT_ID } from '../tenant';
export { GLOBAL_TENANT_ID };

// ─── Tenant scoping helpers ────────────────────────────────────────────

/**
 * Return the tenant id that a user is restricted to, or null when the user
 * may read across all tenants (SUPER_ADMIN / EXECUTIVE / bu === 'ALL').
 * PARTNER is scoped by partner name, not tenant (handled separately).
 */
export function tenantScope(user: AuthUser): string | null {
  if (user.role === 'SUPER_ADMIN' || user.role === 'EXECUTIVE') return null;
  if (user.bu === 'ALL') return null;
  if (isPartner(user)) return null;
  return user.tenantId || '';
}

export function isPartner(user: AuthUser): boolean {
  return user.role === 'PARTNER';
}

/** The payment-partner name for an account, from the partner column or legacy `bu`. */
export function partnerNameFor(user: AuthUser): string {
  return (user.partner || user.bu || '').toLowerCase();
}

/**
 * Apply partner scoping to a ticket query. Prefers the partner_org_id FK
 * (migration 044) and falls back to case-insensitive name matching for rows
 * or accounts that have not been migrated yet. Returns the query for chaining.
 */
export function scopeTicketsToPartner(query: any, user: AuthUser) {
  if (user.partnerOrgId != null) {
    return query.eq('partner_org_id', user.partnerOrgId);
  }
  return query.ilike('partner', partnerNameFor(user));
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** Convert snake_case DB row to camelCase for frontend compatibility */
export function toCamel(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = value;
  }
  return result;
}

/** Convert camelCase frontend object to snake_case for Supabase */
export function toSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snake = key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    result[snake] = value;
  }
  return result;
}

export function tryDecrypt(encryptedText: string | null | undefined): string {
  if (!encryptedText) return '';
  try {
    const result = decrypt(encryptedText);
    return result === encryptedText ? '' : result;
  } catch {
    return '';
  }
}

/** Resolve the tenant id a ticket belongs to, or the global tenant. */
export async function ticketTenantId(ticketId: string | null | undefined): Promise<string> {
  if (!ticketId) return GLOBAL_TENANT_ID;
  const { data } = await supabase.from('tickets').select('tenant_id').eq('id', ticketId).single();
  return data?.tenant_id || GLOBAL_TENANT_ID;
}

export async function ensureTenantForBu(bu: string | undefined | null): Promise<string> {
  const tenantId = tenantIdForBu(bu);
  if (tenantId === GLOBAL_TENANT_ID) return tenantId;
  const name = String(bu ?? '').trim().toUpperCase() || tenantId;
  const { error } = await supabase
    .from('tenants')
    .upsert({ id: tenantId, name, business_units: [String(bu ?? '').trim()] }, { onConflict: 'id' });
  if (error) throw new Error(`ensureTenantForBu failed: ${error.message}`);
  return tenantId;
}

// ─── Partner organization resolution ───────────────────────────────────

// TTL-bounded cache (previously unbounded — a slow memory leak). Entries
// expire after 10 minutes and the map is capped so pathological partner-name
// churn cannot grow the heap without limit.
const PARTNER_ORG_CACHE_TTL_MS = 10 * 60_000;
const PARTNER_ORG_CACHE_MAX = 1_000;
const partnerOrgIdCache = new Map<string, { id: number | null; expiresAt: number }>();

/** Look up (and cache) the partner_organizations id for a partner name. */
export async function resolvePartnerOrgId(partner: string): Promise<number | null> {
  const name = String(partner || '').trim().toLowerCase();
  if (!name) return null;
  const cached = partnerOrgIdCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.id;
  const { data } = await supabase
    .from('partner_organizations')
    .select('id')
    .ilike('name', name)
    .maybeSingle();
  const id = (data?.id as number | undefined) ?? null;
  if (partnerOrgIdCache.size >= PARTNER_ORG_CACHE_MAX) {
    // Drop expired entries first, then evict oldest-inserted as a fallback.
    const now = Date.now();
    for (const [k, v] of partnerOrgIdCache) {
      if (v.expiresAt <= now) partnerOrgIdCache.delete(k);
    }
    while (partnerOrgIdCache.size >= PARTNER_ORG_CACHE_MAX) {
      const oldest = partnerOrgIdCache.keys().next().value;
      if (oldest === undefined) break;
      partnerOrgIdCache.delete(oldest);
    }
  }
  partnerOrgIdCache.set(name, { id, expiresAt: Date.now() + PARTNER_ORG_CACHE_TTL_MS });
  return id;
}
