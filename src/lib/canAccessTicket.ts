/**
 * Object-level ticket access check for the authenticated principal.
 *
 * Pure module: no server-only imports so it is unit-testable everywhere.
 * Mirrors the scoping the repository applies at the query level
 * (tenant/partner_org filters) as a defense-in-depth double check.
 */

import { isBuSupportRole, isGlobalRole } from './rbac';

export interface TicketAccessPrincipal {
  role: string;
  bu: string;
  partner?: string;
  partnerOrgId?: number;
}

export interface TicketAccessTarget {
  businessUnit?: string;
  business_unit?: string;
  partner?: string;
  provider?: string;
  assignedAgentId?: string;
  partnerOrgId?: number;
  partner_org_id?: number;
}

export function canAccessTicket(user: TicketAccessPrincipal, ticket: TicketAccessTarget): boolean {
  if (isGlobalRole(user.role)) return true;
  const bu = (ticket.businessUnit || ticket.business_unit || '').toLowerCase();
  if (user.role === 'CUSTOMER') {
    const myBu = user.bu.toLowerCase();
    return myBu === 'all' || bu === myBu;
  }
  if (isBuSupportRole(user.role)) {
    const myBu = user.bu.toLowerCase();
    return myBu === 'all' || bu === myBu;
  }
  if (user.role === 'PARTNER') {
    const partner = (ticket.partner || ticket.provider || '').toLowerCase();
    const mine = (user.partner || user.bu || '').toLowerCase();
    const agent = (ticket.assignedAgentId || '').toLowerCase();
    const ticketPartnerOrgId = ticket.partnerOrgId ?? ticket.partner_org_id;
    const mineOrgId = user.partnerOrgId;
    // Org-scoped partner: FK equality is the sole criterion, mirroring the
    // repository query filter (.eq('partner_org_id', ...)). A ticket with a
    // different org — or none at all — is invisible; the name fallback below
    // never applies once the account carries an org id.
    if (mineOrgId != null) {
      return ticketPartnerOrgId != null && ticketPartnerOrgId === mineOrgId;
    }
    // Pre-migration account without an org id: case-insensitive name match.
    return (
      partner === mine ||
      agent === mine ||
      agent.startsWith(mine + ' ')
    );
  }
  return false;
}
