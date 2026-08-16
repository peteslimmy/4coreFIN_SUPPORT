-- 4CoreFinSupport — SQL-side customer ticket counts
-- Migration 043: Aggregate ticket counts per customer in the database instead
-- of shipping every ticket row to the API server.
--
-- Note: the previous JS-side fallback matched tickets by (customer_email,
-- business_unit). Since migration 031, tickets.customer_email is encrypted at
-- rest with a per-row random IV, so plaintext equality matching no longer
-- works. customer_id (set by findOrCreateCustomer on every create/patch) is
-- the reliable join key; the email fallback is intentionally dropped.

CREATE OR REPLACE FUNCTION customer_ticket_counts(
  p_tenant_id TEXT DEFAULT NULL,
  p_business_unit TEXT DEFAULT NULL
)
RETURNS TABLE (customer_id TEXT, total BIGINT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT t.customer_id, COUNT(*)::BIGINT AS total
  FROM tickets t
  WHERE t.is_deleted = false
    AND t.customer_id IS NOT NULL
    AND (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (p_business_unit IS NULL OR t.business_unit = p_business_unit)
  GROUP BY t.customer_id;
$$;

COMMENT ON FUNCTION customer_ticket_counts(TEXT, TEXT) IS
  'Non-deleted ticket totals per customer_id, optionally scoped to a tenant or business unit. Used by listCustomers to avoid fetching all ticket rows.';
