import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ROLES,
  hasPermissionForRoleId,
  BU_SUPPORT_BASE_PERMISSIONS,
  BU_SUPPORT_L2_PERMISSIONS,
  BU_SUPPORT_L3_PERMISSIONS,
} from './rbac';

function role(id: string) {
  const def = DEFAULT_ROLES.find((r) => r.id === id);
  if (!def) throw new Error(`missing role ${id}`);
  return def;
}

function can(roleId: string, permission: Parameters<typeof hasPermissionForRoleId>[2]): boolean {
  return hasPermissionForRoleId(DEFAULT_ROLES, roleId, permission);
}

describe('BU support tier differentiation', () => {
  it('gives L1 frontline handling only', () => {
    expect(role('BU_SUPPORT_L1').permissions).toEqual(BU_SUPPORT_BASE_PERMISSIONS);
    expect(can('BU_SUPPORT_L1', 'tickets:view')).toBe(true);
    expect(can('BU_SUPPORT_L1', 'tickets:create')).toBe(true);
    expect(can('BU_SUPPORT_L1', 'tickets:escalate')).toBe(false);
    expect(can('BU_SUPPORT_L1', 'tickets:merge')).toBe(false);
    expect(can('BU_SUPPORT_L1', 'tickets:unmask')).toBe(false);
    expect(can('BU_SUPPORT_L1', 'tickets:delete')).toBe(false);
    expect(can('BU_SUPPORT_L1', 'admin:config')).toBe(false);
    expect(can('BU_SUPPORT_L1', 'audit:write')).toBe(false);
    expect(can('BU_SUPPORT_L1', 'major-incidents:declare')).toBe(false);
  });

  it('unlocks escalation, merge, unmask, and declare at L2', () => {
    expect(role('BU_SUPPORT_L2').permissions).toEqual(BU_SUPPORT_L2_PERMISSIONS);
    expect(can('BU_SUPPORT_L2', 'tickets:escalate')).toBe(true);
    expect(can('BU_SUPPORT_L2', 'tickets:merge')).toBe(true);
    expect(can('BU_SUPPORT_L2', 'tickets:unmask')).toBe(true);
    expect(can('BU_SUPPORT_L2', 'major-incidents:declare')).toBe(true);
    // Destructive + administrative capabilities remain L3+.
    expect(can('BU_SUPPORT_L2', 'tickets:delete')).toBe(false);
    expect(can('BU_SUPPORT_L2', 'admin:config')).toBe(false);
    expect(can('BU_SUPPORT_L2', 'audit:write')).toBe(false);
  });

  it('unlocks deletion, config administration, and audit writing at L3', () => {
    expect(role('BU_SUPPORT_L3').permissions).toEqual(BU_SUPPORT_L3_PERMISSIONS);
    expect(can('BU_SUPPORT_L3', 'tickets:delete')).toBe(true);
    expect(can('BU_SUPPORT_L3', 'admin:config')).toBe(true);
    expect(can('BU_SUPPORT_L3', 'audit:write')).toBe(true);
  });

  it('keeps the legacy flat role at full power (migration safety)', () => {
    expect(can('BU_SUPPORT', 'tickets:delete')).toBe(true);
    expect(can('BU_SUPPORT', 'tickets:escalate')).toBe(true);
    expect(can('BU_SUPPORT', 'admin:config')).toBe(true);
    expect(can('BU_SUPPORT', 'audit:write')).toBe(true);
    expect(can('BU_SUPPORT', 'major-incidents:declare')).toBe(true);
  });

  it('tiers are strictly additive (L1 ⊂ L2 ⊂ L3)', () => {
    const ids = (perms: typeof BU_SUPPORT_BASE_PERMISSIONS) => new Set(perms);
    const l1 = ids(BU_SUPPORT_BASE_PERMISSIONS);
    const l2 = ids(BU_SUPPORT_L2_PERMISSIONS);
    const l3 = ids(BU_SUPPORT_L3_PERMISSIONS);
    for (const p of l1) expect(l2.has(p)).toBe(true);
    for (const p of l2) expect(l3.has(p)).toBe(true);
    expect(l3.size).toBeGreaterThan(l2.size);
    expect(l2.size).toBeGreaterThan(l1.size);
  });

  it('other roles are unaffected by the tier split', () => {
    expect(can('SUPER_ADMIN', 'tickets:delete')).toBe(true);
    expect(can('EXECUTIVE', 'tickets:edit')).toBe(false);
    expect(can('PARTNER', 'tickets:edit')).toBe(true);
    expect(can('PARTNER', 'tickets:delete')).toBe(false);
    expect(can('CUSTOMER', 'tickets:create')).toBe(true);
    expect(can('CUSTOMER', 'tickets:edit')).toBe(false);
  });
});
