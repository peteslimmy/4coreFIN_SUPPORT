import type { Permission, RoleDefinition } from '../types/rbac';

export const ALL_PERMISSIONS: Permission[] = [
  'tickets:view', 'tickets:create', 'tickets:edit', 'tickets:resolve',
  'tickets:delete', 'tickets:escalate', 'tickets:merge', 'tickets:unmask', 'tickets:assign',
  'comments:view', 'comments:create', 'comments:internal',
  'major-incidents:manage', 'customers:manage', 'notifications:view',
  'audit:view', 'audit:verify', 'reports:view', 'executive:dashboard',
  'provider:rca', 'admin:config', 'admin:users', 'admin:forms', 'admin:access',
  'admin:branding', 'admin:sla',
];

export const PERMISSION_GROUPS: { group: string; permissions: { id: Permission; label: string }[] }[] = [
  {
    group: 'Tickets',
    permissions: [
      { id: 'tickets:view', label: 'View tickets' },
      { id: 'tickets:create', label: 'Create tickets' },
      { id: 'tickets:edit', label: 'Edit ticket details' },
      { id: 'tickets:resolve', label: 'Resolve tickets' },
      { id: 'tickets:delete', label: 'Delete/archive tickets' },
      { id: 'tickets:escalate', label: 'Escalate tickets' },
      { id: 'tickets:merge', label: 'Merge tickets' },
      { id: 'tickets:unmask', label: 'Unmask sensitive fields' },
      { id: 'tickets:assign', label: 'Assign tickets' },
    ],
  },
  {
    group: 'Comments & Notifications',
    permissions: [
      { id: 'comments:view', label: 'View comments' },
      { id: 'comments:create', label: 'Add comments' },
      { id: 'comments:internal', label: 'Internal-only comments' },
      { id: 'notifications:view', label: 'View notifications' },
    ],
  },
  {
    group: 'Operations',
    permissions: [
      { id: 'major-incidents:manage', label: 'Manage major incidents' },
      { id: 'customers:manage', label: 'Manage customers' },
      { id: 'provider:rca', label: 'Submit root cause analysis' },
    ],
  },
  {
    group: 'Oversight',
    permissions: [
      { id: 'audit:view', label: 'View audit logs' },
      { id: 'audit:verify', label: 'Verify audit chain' },
      { id: 'reports:view', label: 'View reports' },
      { id: 'executive:dashboard', label: 'Access executive dashboard' },
    ],
  },
  {
    group: 'Administration',
    permissions: [
      { id: 'admin:config', label: 'Manage config lists' },
      { id: 'admin:users', label: 'Manage users & roles' },
      { id: 'admin:forms', label: 'Manage complaint forms' },
      { id: 'admin:access', label: 'Manage access control' },
      { id: 'admin:branding', label: 'Manage branding/theme/integrations' },
      { id: 'admin:sla', label: 'Run SLA checks' },
    ],
  },
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
      'audit:view', 'reports:view', 'admin:config',
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

export function hasAnyPermission(role: RoleDefinition | undefined, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

export function isSuperAdminRole(role: RoleDefinition | undefined): boolean {
  return !!role && role.isSystem && role.permissions === '*';
}
