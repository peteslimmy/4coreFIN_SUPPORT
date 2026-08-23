export interface Organization {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface BusinessUnit {
  id: string;
  organization_id: string;
  buid: string;
  name: string;
  status: 'active' | 'inactive';
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentPartner {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface PaymentPartnerBusinessUnit {
  payment_partner_id: string;
  business_unit_id: string;
  status: 'active' | 'inactive';
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface PartnerBuLinkWithBU extends PaymentPartnerBusinessUnit {
  businessUnit: BusinessUnit | null;
}

export interface CreateOrganizationInput {
  name: string;
  code: string;
  status?: 'active' | 'inactive';
}

export interface CreateBusinessUnitInput {
  organizationId: string;
  buid: string;
  name: string;
  tenantId: string;
  status?: 'active' | 'inactive';
}

export interface CreatePaymentPartnerInput {
  name: string;
  code: string;
  status?: 'active' | 'inactive';
}

export interface CreatePartnerBuLinkInput {
  paymentPartnerId: string;
  businessUnitId: string;
  status?: 'active' | 'inactive';
}
