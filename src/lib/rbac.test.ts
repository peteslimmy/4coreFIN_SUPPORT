import { describe, it, expect } from 'vitest';
import { getRoles, hasPermission, hasAnyPermission, isSuperAdminRole, DEFAULT_ROLES } from './rbac';

describe('rbac', () => {
  it('exposes the five built-in system roles', () => {
    expect(DEFAULT_ROLES).toHaveLength(5);
    expect(DEFAULT_ROLES.every(r => r.isSystem)).toBe(true);
  });

  it('grants Super Admin wildcard access to every permission', () => {
    const superAdmin = getRoles([]).find(r => r.id === 'SUPER_ADMIN')!;
    expect(isSuperAdminRole(superAdmin)).toBe(true);
    expect(hasPermission(superAdmin, 'admin:users')).toBe(true);
    expect(hasPermission(superAdmin, 'tickets:delete')).toBe(true);
  });

  it('respects explicit permission lists for BU_SUPPORT', () => {
    const roles = getRoles([]);
    const buSupport = roles.find(r => r.id === 'BU_SUPPORT')!;
    expect(hasPermission(buSupport, 'tickets:merge')).toBe(true);
    expect(hasPermission(buSupport, 'executive:dashboard')).toBe(false);
    expect(hasPermission(buSupport, 'admin:users')).toBe(false);
    expect(hasPermission(buSupport, 'admin:config')).toBe(true);
  });

  it('keeps EXECUTIVE read-only', () => {
    const exec = getRoles([]).find(r => r.id === 'EXECUTIVE')!;
    expect(hasPermission(exec, 'tickets:view')).toBe(true);
    expect(hasPermission(exec, 'audit:verify')).toBe(true);
    expect(hasPermission(exec, 'tickets:create')).toBe(false);
    expect(hasPermission(exec, 'tickets:resolve')).toBe(false);
  });

  it('merges custom roles while preserving system roles', () => {
    const custom = {
      id: 'COMPLIANCE',
      name: 'Compliance Officer',
      description: 'Custom role',
      isSystem: false,
      buScoped: true,
      permissions: ['audit:view', 'audit:verify'],
    } as const;
    const roles = getRoles([custom]);
    expect(roles.find(r => r.id === 'COMPLIANCE')).toBeDefined();
    expect(roles.filter(r => r.isSystem)).toHaveLength(5);
    const compliance = roles.find(r => r.id === 'COMPLIANCE')!;
    expect(hasPermission(compliance, 'audit:verify')).toBe(true);
    expect(hasPermission(compliance, 'tickets:delete')).toBe(false);
    expect(hasAnyPermission(compliance, ['audit:verify', 'admin:users'])).toBe(true);
  });

  it('defaults unknown roles to no permissions', () => {
    const roles = getRoles([]);
    const ghost = roles.find(r => r.id === 'NOPE');
    expect(ghost).toBeUndefined();
    expect(hasPermission(undefined, 'tickets:view')).toBe(false);
  });
});
