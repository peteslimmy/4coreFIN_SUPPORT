-- 4CoreFinSupport — Add audit event_id column to audit_logs
-- Migration 042
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event TEXT;

COMMENT ON COLUMN audit_logs.event IS 'Application-level event discriminator (e.g. TICKET_CREATED, EVIDENCE_UPLOADED). Populated from the typed audit catalog. Mirrors action at write-time but can diverge for multi-row operations.';

-- Backfill `event` from `action` for pre-existing rows. The audit_logs
-- immutability trigger blocks UPDATE by design, so lift it for this single
-- backfill statement and restore it immediately after.
DROP TRIGGER IF EXISTS audit_logs_protect ON audit_logs;
UPDATE audit_logs SET event = action WHERE event IS NULL;
CREATE TRIGGER audit_logs_protect BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event);