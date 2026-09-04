-- 4CoreFinSupport — Email ingest dedupe (review finding API-04)
-- The inbound-email webhook deduplicates via a check-then-insert race, which
-- allows concurrent duplicates. This migration adds the missing unique index
-- so the route can rely on atomic 23505 handling instead.
--
-- Pre-dedupe: collapse any existing duplicate message_id rows (keep the
-- earliest received), otherwise the unique index creation would fail.

DELETE FROM email_ingest.inbound_emails a
USING email_ingest.inbound_emails b
WHERE a.message_id = b.message_id
  AND (a.received_at > b.received_at
       OR (a.received_at = b.received_at AND a.id > b.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_inbound_message_id
  ON email_ingest.inbound_emails(message_id);