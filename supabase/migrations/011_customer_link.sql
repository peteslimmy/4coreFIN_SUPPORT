-- 4CoreFinSupport — Customer ↔ Ticket linkage
-- Tickets should reference the customers table (customer_id) as the authoritative
-- link, with the inline email snapshot kept as a legacy fallback.
-- One customer row per (email, business_unit): a single email can legitimately
-- exist in multiple business units, each a separate tenant.

-- 1. Replace the global UNIQUE(email) with a per-business-unit unique constraint.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS uq_customers_email;
ALTER TABLE customers
  ADD CONSTRAINT uq_customers_email_bu UNIQUE (email, business_unit);

-- 2. Foreign key from tickets.customer_id -> customers.id.
-- ON DELETE SET NULL preserves the inline customer email/name snapshot even if a
-- customer record is removed.
ALTER TABLE tickets
  ADD CONSTRAINT fk_tickets_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- 3. Index for reverse lookups (customer -> tickets).
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);
