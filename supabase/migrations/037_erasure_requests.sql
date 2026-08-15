-- 4CoreFinSupport — GDPR erasure workflow
-- Migration 037: Erasure requests table + anonymize_pii function.

-- Erasure requests table: one row per erasure request, submitted by an admin.
CREATE TABLE IF NOT EXISTS erasure_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by TEXT NOT NULL,         -- admin user ID or 'admin'
  ticket_id TEXT NULL,               -- optional: ticket being erased
  reason TEXT NOT NULL,              -- free-text reason
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

-- Indexes for status lookups and ticket lookups
CREATE INDEX IF NOT EXISTS idx_erasure_requests_status ON erasure_requests (status);
CREATE INDEX IF NOT EXISTS idx_erasure_requests_ticket ON erasure_requests (ticket_id);

-- Stored procedure: anonymize the PII fields of a given ticket.
-- Sets customer_email, customer_phone, card_pan, submitted_by_phone to NULL
-- while preserving the audit hash chain (the audit log entries remain intact
-- with masked/hashed values; this function only clears the operational PII).
CREATE OR REPLACE FUNCTION anonymize_ticket_pii(ticket_id TEXT) RETURNS INTEGER AS $$
DECLARE
  rows_affected INTEGER := 0;
BEGIN
  UPDATE tickets
  SET
    customer_email = NULL,
    customer_phone = NULL,
    card_pan = NULL,
    submitted_by_phone = NULL
  WHERE id = ticket_id;

  GET DIAGNOSTIC rows_affected = ROW_COUNT;

  -- Log the erasure action in the audit trail
  -- (appendAuditLog is called from the admin route; we just record the count)
  RETURN rows_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Commentary
COMMENT ON TABLE erasure_requests IS 'GDPR erasure requests; pending -> in_progress -> completed';
COMMENT ON COLUMN erasure_requests.reason IS 'User-provided reason for the erasure request';
COMMENT ON COLUMN erasure_requests.status IS 'pending=admin submitted, in_progress=PII being cleared, completed=done, rejected=denied';
COMMENT ON FUNCTION anonymize_ticket_pii(ticket_id) IS 'Null out PII fields for a ticket; audit logs are preserved separately.';