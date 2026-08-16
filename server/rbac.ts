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
  | 'major-incidents:declare'
  | 'customers:manage'
  | 'notifications:view'
  | 'audit:view'
  | 'audit:write'
  | 'audit:verify'
  | 'reports:view'
  | 'executive:dashboard'
  | 'partner:rca'
  | 'admin:config'
  | 'admin:users'
  | 'admin:forms'
  | 'admin:access'
  | 'admin:branding'
  | 'admin:landing_page'
  | 'admin:sla'
  | 'users:view';

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  buScoped: boolean;
  permissions: Permission[] | '*';
}

export const BU_SUPPORT_LEVEL_ROLES = ['BU_SUPPORT_L1', 'BU_SUPPORT_L2', 'BU_SUPPORT_L3'] as const;

export function isBuSupportRole(role: string | undefined | null): boolean {
  return role === 'BU_SUPPORT' || (BU_SUPPORT_LEVEL_ROLES as readonly string[]).includes(role ?? '');
}

export function isPartnerRole(role: string | undefined | null): boolean {
  return role === 'PARTNER';
}

export function isGlobalRole(role: string | undefined | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'EXECUTIVE';
}

/**
 * Tiered BU support permissions. Every tier shares the handling base; higher
 * tiers unlock destructive/oversight capabilities:
 *   L1 — frontline handling only (no escalation, merge, unmask, delete, admin)
 *   L2 — + escalation, merge, PII unmask, major-incident declaration
 *   L3 — + ticket deletion, config administration, audit writing
 * The legacy flat BU_SUPPORT role keeps the full pre-tier set so existing
 * accounts are not de-provisioned by the migration.
 */
export const BU_SUPPORT_BASE_PERMISSIONS: Permission[] = [
  'tickets:view', 'tickets:create', 'tickets:edit', 'tickets:resolve',
  'tickets:assign',
  'comments:view', 'comments:create', 'comments:internal',
  'major-incidents:manage', 'customers:manage', 'notifications:view',
  'audit:view', 'reports:view', 'users:view',
];

export const BU_SUPPORT_L2_PERMISSIONS: Permission[] = [
  ...BU_SUPPORT_BASE_PERMISSIONS,
  'tickets:escalate', 'tickets:merge', 'tickets:unmask',
  'major-incidents:declare',
];

export const BU_SUPPORT_L3_PERMISSIONS: Permission[] = [
  ...BU_SUPPORT_L2_PERMISSIONS,
  'tickets:delete', 'admin:config', 'audit:write',
];

/** Legacy flat role: the union the platform granted before tiers existed. */
export const BU_SUPPORT_PERMISSIONS: Permission[] = [
  ...BU_SUPPORT_L3_PERMISSIONS,
];

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
    id: 'BU_SUPPORT_L1',
    name: 'Business Unit Support — Level 1',
    description: 'First-line BU agent. Files and tracks tickets for the assigned business unit; escalates up to L2/L3 rather than handling escalations directly.',
    isSystem: true,
    buScoped: true,
    permissions: [...BU_SUPPORT_BASE_PERMISSIONS],
  },
  {
    id: 'BU_SUPPORT_L2',
    name: 'Business Unit Support — Level 2',
    description: 'Senior BU agent. Escalates and merges tickets, unmasks PII, and declares major incidents for the assigned business unit.',
    isSystem: true,
    buScoped: true,
    permissions: [...BU_SUPPORT_L2_PERMISSIONS],
  },
  {
    id: 'BU_SUPPORT_L3',
    name: 'Business Unit Support — Level 3',
    description: 'Lead BU agent. Final BU-side escalation tier: owns escalated tickets, deletes/archives tickets, and administers reference configuration.',
    isSystem: true,
    buScoped: true,
    permissions: [...BU_SUPPORT_L3_PERMISSIONS],
  },
  {
    id: 'BU_SUPPORT',
    name: 'Business Unit Support (legacy)',
    description: 'Legacy flat BU role. Migrated accounts map to BU_SUPPORT_L1 when provisioned anew.',
    isSystem: true,
    buScoped: true,
    permissions: [...BU_SUPPORT_PERMISSIONS],
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
    id: 'PARTNER',
    name: 'Payment Partner',
    description: 'Handles assigned tickets and submits root cause analyses.',
    isSystem: true,
    buScoped: true,
    permissions: ['tickets:view', 'tickets:edit', 'comments:view', 'comments:create', 'partner:rca', 'major-incidents:manage', 'major-incidents:declare'],
  },
  {
    id: 'CUSTOMER',
    name: 'Customer',
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
