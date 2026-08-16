-- 4CoreFinSupport — Add audit event_id column to audit_logs
-- Migration 042
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event TEXT;

COMMENT ON COLUMN audit_logs.event IS 'Application-level event discriminator (e.g. TICKET_CREATED, EVIDENCE_UPLOADED). Populated from the typed audit catalog. Mirrors action at write-time but can diverge for multi-row operations.';

UPDATE audit_logs SET event = action WHERE event IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event);