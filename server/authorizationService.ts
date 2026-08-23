import { supabase } from './supabase';
import type { AuthUser } from './compliance';

// ── Authorization service ────────────────────────────────────────────
// Provides scope-based access evaluation for ABAC.
// Works alongside existing RBAC in rbac.ts.

const TBL = (name: string) => `identity.${name}` as any;

export interface AccessScope {
  id: string;
  user_id: string;
  scope_type: 'business_unit' | 'payment_partner' | 'organization';
  scope_id: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

// ── Read scopes ─────────────────────────────────────────────────────

export async function getUserScopes(userId: string): Promise<AccessScope[]> {
  const { data, error } = await supabase
    .from(TBL('access_scopes'))
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as AccessScope[];
}

export async function addUserScope(
  userId: string,
  scopeType: AccessScope['scope_type'],
  scopeId: string,
): Promise<void> {
  const { error } = await supabase
    .from(TBL('access_scopes'))
    .insert({ user_id: userId, scope_type: scopeType, scope_id: scopeId });
  if (error) throw new Error(error.message);
}

export async function removeUserScope(
  userId: string,
  scopeType: AccessScope['scope_type'],
  scopeId: string,
): Promise<void> {
  const { error } = await supabase
    .from(TBL('access_scopes'))
    .delete()
    .eq('user_id', userId)
    .eq('scope_type', scopeType)
    .eq('scope_id', scopeId);
  if (error) throw new Error(error.message);
}

// ── Scope evaluation ────────────────────────────────────────────────

/**
 * Check if a user has access to a specific business unit via their scopes.
 * Returns true if:
 * - User is SUPER_ADMIN or EXECUTIVE (global roles)
 * - User has no explicit scopes (legacy accounts — grant full access)
 * - User has a matching business_unit scope
 * - User has a payment_partner scope that covers the BU (checked externally)
 */
export function canAccessBU(
  user: AuthUser,
  scopes: AccessScope[],
  targetBu: string,
): boolean {
  // Global roles bypass scope checks
  if (user.role === 'SUPER_ADMIN' || user.role === 'EXECUTIVE') return true;

  // Legacy: if no scopes exist, fall back to existing bu/partner matching
  const buScopes = scopes.filter((s) => s.scope_type === 'business_unit');
  if (buScopes.length === 0) {
    // No explicit scopes — rely on existing user.bu matching
    return user.bu === 'ALL' || user.bu === targetBu;
  }

  // Check if user has a scope for the target BU
  return buScopes.some((s) => s.scope_id === targetBu);
}

/**
 * Check if a user has access to a ticket based on scope.
 * Returns true if the user can access tickets in the ticket's BU.
 */
export function canAccessTicket(
  user: AuthUser,
  scopes: AccessScope[],
  ticketBU: string,
): boolean {
  return canAccessBU(user, scopes, ticketBU);
}

/**
 * Get all BUs a user has access to via their scopes.
 * Returns null for global roles (means: all BUs).
 * Returns empty array if no scopes and no legacy BU.
 */
export function getAccessibleBUs(
  user: AuthUser,
  scopes: AccessScope[],
): string[] | null {
  if (user.role === 'SUPER_ADMIN' || user.role === 'EXECUTIVE') return null;

  const buScopes = scopes.filter((s) => s.scope_type === 'business_unit');
  if (buScopes.length === 0) {
    if (user.bu === 'ALL') return null;
    return user.bu ? [user.bu] : [];
  }

  return buScopes.map((s) => s.scope_id);
}
