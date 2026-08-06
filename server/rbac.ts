export type Permission =
  | 'tickets:view'
  | 'tickets:create'
  | 'tickets:edit'
  | 'tickets:resolve'
  | 'tickets:delete'
  | 'tickets:escalate'
  | 'tickets:merge'
  | 'tickets:unmask'
  | 'tickets:assign'
  | 'comments:view'
  | 'comments:create'
  | 'comments:internal'
  | 'major-incidents:manage'
  | 'customers:manage'
  | 'notifications:view'
  | 'audit:view'
  | 'audit:write'
  | 'audit:verify'
  | 'reports:view'
  | 'executive:dashboard'
  | 'provider:rca'
  | 'admin:config'
  | 'admin:users'
  | 'admin:forms'
  | 'admin:access'
  | 'admin:branding'
  | 'admin:sla';

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  buScoped: boolean;
  permissions: Permission[] | '*';
}

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'Full platform access. Cannot be deleted or demoted.',
    isSystem: true,
    buScoped: false,
    permissions: '*',
  },
  {
    id: 'BU_SUPPORT',
    name: 'Business Unit Support',
    description: 'Ticket operations, config management, and investigation for assigned business unit(s).',
    isSystem: true,
    buScoped: true,
    permissions: [
      'tickets:view', 'tickets:create', 'tickets:edit', 'tickets:resolve',
      'tickets:delete', 'tickets:escalate', 'tickets:merge', 'tickets:unmask', 'tickets:assign',
      'comments:view', 'comments:create', 'comments:internal',
      'major-incidents:manage', 'customers:manage', 'notifications:view',
      'audit:view', 'audit:write', 'reports:view', 'admin:config',
    ],
  },
  {
    id: 'EXECUTIVE',
    name: 'Executive',
    description: 'Read-only oversight dashboards, compliance, and audit verification.',
    isSystem: true,
    buScoped: false,
    permissions: [
      'tickets:view', 'tickets:unmask', 'comments:view', 'notifications:view',
      'audit:view', 'audit:verify', 'reports:view', 'executive:dashboard',
    ],
  },
  {
    id: 'PROVIDER',
    name: 'Provider',
    description: 'Handles assigned tickets and submits root cause analyses.',
    isSystem: true,
    buScoped: true,
    permissions: ['tickets:view', 'tickets:edit', 'comments:view', 'comments:create', 'provider:rca'],
  },
  {
    id: 'PARTNER',
    name: 'Partner',
    description: 'Files complaints on behalf of their business unit and tracks own tickets.',
    isSystem: true,
    buScoped: true,
    permissions: ['tickets:create', 'tickets:view', 'comments:view'],
  },
];

export function getRoles(stored: RoleDefinition[] | null | undefined): RoleDefinition[] {
  const merged = [...DEFAULT_ROLES];
  for (const custom of stored || []) {
    const existing = merged.findIndex(r => r.id === custom.id);
    if (existing >= 0) {
      if (custom.isSystem) merged[existing] = custom;
    } else {
      merged.push(custom);
    }
  }
  return merged;
}

export function hasPermission(role: RoleDefinition | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role.permissions === '*') return true;
  return role.permissions.includes(permission);
}

export function hasPermissionForRoleId(
  roles: RoleDefinition[],
  roleId: string,
  permission: Permission
): boolean {
  return hasPermission(roles.find(r => r.id === roleId), permission);
}
