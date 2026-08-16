import { describe, it, expect } from 'vitest';
import { canAccessTicket } from './canAccessTicket';

function partnerUser(overrides: Record<string, unknown> = {}) {
  return {
    role: 'PARTNER',
    bu: 'Paystack',
    partner: 'Paystack',
    ...overrides,
  };
}

const ticket = (overrides: Record<string, unknown> = {}) => ({
  businessUnit: 'ALPHA',
  partner: 'Paystack',
  assignedAgentId: '',
  ...overrides,
});

describe('canAccessTicket — partner org FK isolation', () => {
  it('matches by partner_org_id when both sides have one', () => {
    const user = partnerUser({ partnerOrgId: 7 });
    expect(canAccessTicket(user, ticket({ partner_org_id: 7, partner: 'paystack' }))).toBe(true);
    expect(canAccessTicket(user, ticket({ partner_org_id: 8, partner: 'Paystack' }))).toBe(false);
  });

  it('FK match wins even when the legacy name strings disagree', () => {
    const user = partnerUser({ partnerOrgId: 7, partner: 'PayStack Nigeria' });
    expect(canAccessTicket(user, ticket({ partner_org_id: 7, partner: 'paystack-ng' }))).toBe(true);
  });

  it('falls back to case-insensitive name matching when either side lacks the FK', () => {
    const user = partnerUser(); // no partnerOrgId (pre-migration account)
    expect(canAccessTicket(user, ticket({ partner: 'paystack' }))).toBe(true);
    expect(canAccessTicket(user, ticket({ partner: 'Flutterwave' }))).toBe(false);
  });

  it('an org-less ticket is invisible to an org-scoped partner', () => {
    const user = partnerUser({ partnerOrgId: 7, partner: 'Paystack' });
    expect(canAccessTicket(user, ticket({ partner: 'Paystack' }))).toBe(false);
  });

  it('BU users remain tenant-scoped by business unit, not partner', () => {
    const buUser = { role: 'BU_SUPPORT_L1', bu: 'ALPHA', partner: '' };
    expect(canAccessTicket(buUser, ticket({ partner: 'Paystack' }))).toBe(true);
    expect(canAccessTicket(buUser, ticket({ businessUnit: 'BETA' }))).toBe(false);
  });

  it('global roles see everything', () => {
    expect(canAccessTicket({ role: 'SUPER_ADMIN', bu: 'ALL' }, ticket({ businessUnit: 'ANYWHERE' }))).toBe(true);
    expect(canAccessTicket({ role: 'EXECUTIVE', bu: 'CORP' }, ticket({ businessUnit: 'ANYWHERE' }))).toBe(true);
  });
});
