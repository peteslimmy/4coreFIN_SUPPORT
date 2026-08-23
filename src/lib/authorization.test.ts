import { describe, it, expect } from 'vitest';
import { canAccessBU, canAccessTicket, getAccessibleBUs, type AccessScope } from '../../server/authorizationService';
import type { AuthUser } from '../../server/compliance';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'usr-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'BU_SUPPORT_L1',
    bu: 'ALPHA',
    tenantId: 'tnt-ALPHA',
    partner: '',
    partnerOrgId: null,
    ...overrides,
  } as AuthUser;
}

describe('Authorization service', () => {
  describe('canAccessBU', () => {
    it('allows SUPER_ADMIN to access any BU', () => {
      const user = makeUser({ role: 'SUPER_ADMIN' });
      expect(canAccessBU(user, [], 'ANYTHING')).toBe(true);
    });

    it('allows EXECUTIVE to access any BU', () => {
      const user = makeUser({ role: 'EXECUTIVE' });
      expect(canAccessBU(user, [], 'ANYTHING')).toBe(true);
    });

    it('allows legacy user with bu=ALL', () => {
      const user = makeUser({ bu: 'ALL' });
      expect(canAccessBU(user, [], 'ANYTHING')).toBe(true);
    });

    it('allows user to access own BU (legacy, no scopes)', () => {
      const user = makeUser({ bu: 'ALPHA' });
      expect(canAccessBU(user, [], 'ALPHA')).toBe(true);
    });

    it('denies user accessing different BU (legacy, no scopes)', () => {
      const user = makeUser({ bu: 'ALPHA' });
      expect(canAccessBU(user, [], 'BRAVO')).toBe(false);
    });

    it('allows user with matching BU scope', () => {
      const user = makeUser({ bu: 'ALPHA' });
      const scopes: AccessScope[] = [
        { id: 's1', user_id: 'usr-1', scope_type: 'business_unit', scope_id: 'ALPHA', effective_from: '', effective_to: null, created_at: '' },
      ];
      expect(canAccessBU(user, scopes, 'ALPHA')).toBe(true);
    });

    it('denies user without matching BU scope', () => {
      const user = makeUser({ bu: 'ALPHA' });
      const scopes: AccessScope[] = [
        { id: 's1', user_id: 'usr-1', scope_type: 'business_unit', scope_id: 'ALPHA', effective_from: '', effective_to: null, created_at: '' },
      ];
      expect(canAccessBU(user, scopes, 'BRAVO')).toBe(false);
    });

    it('allows user with multiple BU scopes', () => {
      const user = makeUser({ bu: 'ALPHA' });
      const scopes: AccessScope[] = [
        { id: 's1', user_id: 'usr-1', scope_type: 'business_unit', scope_id: 'ALPHA', effective_from: '', effective_to: null, created_at: '' },
        { id: 's2', user_id: 'usr-1', scope_type: 'business_unit', scope_id: 'BRAVO', effective_from: '', effective_to: null, created_at: '' },
      ];
      expect(canAccessBU(user, scopes, 'BRAVO')).toBe(true);
    });
  });

  describe('canAccessTicket', () => {
    it('delegates to canAccessBU', () => {
      const user = makeUser({ bu: 'ALPHA' });
      const scopes: AccessScope[] = [
        { id: 's1', user_id: 'usr-1', scope_type: 'business_unit', scope_id: 'ALPHA', effective_from: '', effective_to: null, created_at: '' },
      ];
      expect(canAccessTicket(user, scopes, 'ALPHA')).toBe(true);
      expect(canAccessTicket(user, scopes, 'BRAVO')).toBe(false);
    });
  });

  describe('getAccessibleBUs', () => {
    it('returns null for SUPER_ADMIN (all BUs)', () => {
      const user = makeUser({ role: 'SUPER_ADMIN' });
      expect(getAccessibleBUs(user, [])).toBeNull();
    });

    it('returns null for bu=ALL legacy', () => {
      const user = makeUser({ bu: 'ALL' });
      expect(getAccessibleBUs(user, [])).toBeNull();
    });

    it('returns legacy BU when no scopes', () => {
      const user = makeUser({ bu: 'ALPHA' });
      expect(getAccessibleBUs(user, [])).toEqual(['ALPHA']);
    });

    it('returns scoped BUs when scopes exist', () => {
      const user = makeUser({ bu: 'ALPHA' });
      const scopes: AccessScope[] = [
        { id: 's1', user_id: 'usr-1', scope_type: 'business_unit', scope_id: 'ALPHA', effective_from: '', effective_to: null, created_at: '' },
        { id: 's2', user_id: 'usr-1', scope_type: 'business_unit', scope_id: 'BRAVO', effective_from: '', effective_to: null, created_at: '' },
      ];
      expect(getAccessibleBUs(user, scopes)).toEqual(['ALPHA', 'BRAVO']);
    });

    it('returns empty array when no scopes and no BU', () => {
      const user = makeUser({ bu: '' });
      expect(getAccessibleBUs(user, [])).toEqual([]);
    });
  });
});
