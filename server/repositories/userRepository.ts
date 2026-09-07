import { supabase } from '../supabase';
import { GLOBAL_TENANT_ID } from '../tenant';
import { ensureTenantForBu, resolvePartnerOrgId } from './shared';

// ─── Users ─────────────────────────────────────────────────────────────

export async function listUsersPublic() {
  const { data, error } = await supabase.from('users').select('id, name, email, role, bu, partner, partner_org_id, account_type, phone, tenant_id, is_active, activation_token, must_change_password').order('name');
  if (error || !data) return [];
  return data.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    bu: u.bu || '',
    partner: u.partner || '',
    partnerOrgId: u.partner_org_id ?? null,
    accountType: u.account_type || (u.role === 'PARTNER' ? 'PARTNER' : 'BU'),
    phone: u.phone || '',
    tenantId: u.tenant_id || '',
    isActive: u.is_active !== false,
    // Derived flags so the admin UI can render Active / Pending / Suspended
    // without ever exposing the raw token or hash. An account is Pending while
    // it is inactive AND either still holds its activation token OR still needs
    // to choose its own password (legacy provisioned users predate tokens).
    activationPending: u.is_active === false && (Boolean(u.activation_token) || Boolean(u.must_change_password)),
    mustChangePassword: Boolean(u.must_change_password),
  }));
}

export async function upsertUser(user: {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  bu?: string;
  partner?: string;
  partnerOrgId?: number | null;
  accountType?: string;
  phone?: string;
  passwordHash?: string;
  authUserId?: string | null;
  tenantId?: string;
  mustChangePassword?: boolean;
  isActive?: boolean;
  activationToken?: string;
  activatedAt?: string;
  tokenVersion?: number;
}) {
  const row: any = { id: user.id };
  if (user.name !== undefined) row.name = user.name;
  if (user.email !== undefined) row.email = user.email;
  if (user.role !== undefined) row.role = user.role;
  if (user.bu !== undefined) row.bu = user.bu;
  if (user.partner !== undefined) row.partner = user.partner;
  if (user.partnerOrgId !== undefined) {
    row.partner_org_id = user.partnerOrgId;
  } else if (user.partner !== undefined && user.partner !== '') {
    // Keep the org FK in sync when the partner name is (re)assigned.
    row.partner_org_id = await resolvePartnerOrgId(user.partner);
  }
  if (user.accountType !== undefined) row.account_type = user.accountType;
  if (user.phone !== undefined) row.phone = user.phone;
  if (user.tenantId !== undefined) {
    row.tenant_id = user.tenantId;
  } else if (user.accountType === 'PARTNER') {
    row.tenant_id = GLOBAL_TENANT_ID;
  } else if (user.bu !== undefined) {
    row.tenant_id = await ensureTenantForBu(user.bu);
  }
  if (user.passwordHash) {
    row.password_hash = user.passwordHash;
  }
  if (user.authUserId !== undefined) {
    row.auth_user_id = user.authUserId;
  }
  if (user.mustChangePassword !== undefined) {
    row.must_change_password = user.mustChangePassword;
  }
  if (user.isActive !== undefined) {
    row.is_active = user.isActive;
  }
  if (user.activationToken !== undefined) {
    row.activation_token = user.activationToken;
  }
  if (user.activatedAt !== undefined) {
    row.activated_at = user.activatedAt;
  }
  if (user.tokenVersion !== undefined) {
    row.token_version = user.tokenVersion;
  }

  const isCompleteCreate = Boolean(user.name && user.email && user.role && user.passwordHash && (user.bu || user.partner));
  if (isCompleteCreate) {
    // Create or full update: insert path also carries auth_user_id. Only used
    // when every NOT NULL column is present; partial updates of existing users
    // (e.g. change/reset password) must not go through upsert, which would
    // reset omitted columns and violate NOT NULL constraints.
    const { error } = await supabase.from('users').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`upsertUser failed: ${error.message}`);
  } else {
    // Partial update: PostgREST .update() touches only the provided columns.
    const { id: _id, ...patch } = row;
    const { error } = await supabase.from('users').update(patch).eq('id', user.id);
    if (error) throw new Error(`upsertUser failed: ${error.message}`);
  }
}

export async function deleteUser(id: string) {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
}
