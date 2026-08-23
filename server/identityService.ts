import { supabase } from './supabase';
import type { Permission, RoleDefinition } from './rbac';

// ── DB-backed identity service ────────────────────────────────────────
// Provides read/write functions for the identity schema tables.
// The existing rbac.ts DEFAULT_ROLES remain the fallback when the DB is empty.

const TBL = (name: string) => `identity.${name}` as any;

export interface DbRole {
  id: string;
  name: string;
  description: string | null;
  role_type: string;
  status: string;
}

export interface DbPermission {
  id: string;
  code: string;
  description: string | null;
  resource: string;
  action: string;
}

export interface DbRolePermission {
  role_id: string;
  permission_id: string;
}

export interface DbUserRole {
  user_id: string;
  role_id: string;
  assigned_at: string;
  assigned_by: string | null;
}

// ── Roles ────────────────────────────────────────────────────────────

export async function listRoles(): Promise<DbRole[]> {
  const { data, error } = await supabase
    .from(TBL('roles'))
    .select('*')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as DbRole[];
}

export async function getRoleById(id: string): Promise<DbRole | null> {
  const { data, error } = await supabase
    .from(TBL('roles'))
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data as DbRole;
}

export async function getRoleByName(name: string): Promise<DbRole | null> {
  const { data, error } = await supabase
    .from(TBL('roles'))
    .select('*')
    .eq('name', name)
    .single();
  if (error || !data) return null;
  return data as DbRole;
}

export async function createRole(input: { name: string; description?: string; role_type?: string }): Promise<DbRole> {
  const id = crypto.randomUUID();
  const row = { id, name: input.name, description: input.description ?? null, role_type: input.role_type ?? 'custom', status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = await supabase.from(TBL('roles')).insert(row);
  if (error) throw new Error(error.message);
  return row as DbRole;
}

export async function updateRole(id: string, input: { name?: string; description?: string; status?: string }): Promise<void> {
  const { error } = await supabase
    .from(TBL('roles'))
    .update(input)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Permissions ──────────────────────────────────────────────────────

export async function listPermissions(): Promise<DbPermission[]> {
  const { data, error } = await supabase
    .from(TBL('permissions'))
    .select('*')
    .order('code');
  if (error) throw new Error(error.message);
  return (data ?? []) as DbPermission[];
}

// ── Role-Permission links ────────────────────────────────────────────

export async function getRolePermissions(roleId: string): Promise<string[]> {
  // Step 1: Get permission IDs for this role
  const { data: rpData, error: rpErr } = await supabase
    .from(TBL('role_permissions'))
    .select('permission_id')
    .eq('role_id', roleId);
  if (rpErr) throw new Error(rpErr.message);
  if (!rpData || rpData.length === 0) return [];

  const permIds = rpData.map((rp: any) => rp.permission_id);

  // Step 2: Get permission codes
  const { data: permData, error: permErr } = await supabase
    .from(TBL('permissions'))
    .select('id, code')
    .in('id', permIds);
  if (permErr) throw new Error(permErr.message);

  const codeMap = new Map((permData ?? []).map((p: any) => [p.id, p.code]));
  return permIds.map((id: string) => codeMap.get(id) ?? id);
}

export async function setRolePermissions(roleId: string, permissionCodes: string[]): Promise<void> {
  // Delete existing
  await supabase.from(TBL('role_permissions')).delete().eq('role_id', roleId);

  if (permissionCodes.length === 0) return;

  // Look up permission IDs
  const { data: perms, error: permErr } = await supabase
    .from(TBL('permissions'))
    .select('id, code')
    .in('code', permissionCodes);
  if (permErr) throw new Error(permErr.message);

  const rows = (perms ?? []).map((p: any) => ({ role_id: roleId, permission_id: p.id }));
  if (rows.length === 0) return;

  const { error } = await supabase.from(TBL('role_permissions')).insert(rows);
  if (error) throw new Error(error.message);
}

// ── User-Role links ─────────────────────────────────────────────────

export async function getUserRoles(userId: string): Promise<DbUserRole[]> {
  const { data, error } = await supabase
    .from(TBL('user_roles'))
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as DbUserRole[];
}

export async function assignUserRole(userId: string, roleId: string, assignedBy?: string): Promise<void> {
  const { error } = await supabase
    .from(TBL('user_roles'))
    .insert({ user_id: userId, role_id: roleId, assigned_by: assignedBy ?? null });
  if (error) throw new Error(error.message);
}

export async function removeUserRole(userId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from(TBL('user_roles'))
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId);
  if (error) throw new Error(error.message);
}

// ── Convert DB role to RoleDefinition (for rbac.ts compatibility) ─────

export async function buildRoleDefinitions(): Promise<RoleDefinition[]> {
  const roles = await listRoles();
  const definitions: RoleDefinition[] = [];

  for (const role of roles) {
    const permCodes = await getRolePermissions(role.id);
    definitions.push({
      id: role.name,
      name: role.name,
      description: role.description ?? '',
      isSystem: role.role_type === 'system',
      buScoped: role.name !== 'SUPER_ADMIN' && role.name !== 'EXECUTIVE',
      permissions: permCodes.length > 0 ? (permCodes as Permission[]) : [],
    });
  }

  return definitions;
}
