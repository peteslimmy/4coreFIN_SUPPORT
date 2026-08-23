-- Indexes covering high-frequency query patterns missing coverage.
--
-- 1. tickets(customer_id): recalcCustomerTotalTickets and customer-scoped
--    ticket lists filter on customer_id + is_deleted on every ticket write.
-- 2. tickets(partner): partner-scoped list/filter queries (the old
--    idx_tickets_tenant_provider index targets the pre-rename `provider`
--    column and no longer matches).
-- 3. customers(business_unit): customer lists filtered per business unit.
-- 4. tickets(customer_id, business_unit): per-customer per-BU counts.

CREATE INDEX IF NOT EXISTS idx_tickets_customer_id
  ON tickets (customer_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_tickets_partner
  ON tickets (tenant_id, partner);

CREATE INDEX IF NOT EXISTS idx_customers_business_unit
  ON customers (business_unit);

CREATE INDEX IF NOT EXISTS idx_tickets_customer_bu
  ON tickets (customer_id, business_unit) WHERE is_deleted = false;
