-- Rename ticket status values to the 5-stage lifecycle workflow:
--   RECEIPT → ASSIGNED → INVESTIGATE → RESOLVED → CLOSED
--
-- Legacy values were IN_PROGRESS (now ASSIGNED) and INVESTIGATION (now INVESTIGATE).
-- This migration is idempotent: UPDATEs normalize any legacy rows still present,
-- then the CHECK constraint is rebuilt around the new canonical set.

-- Normalize existing rows before touching the constraint (old CHECK still permits legacy values).
UPDATE tickets SET status = 'ASSIGNED' WHERE status = 'IN_PROGRESS';
UPDATE tickets SET status = 'INVESTIGATE' WHERE status = 'INVESTIGATION';

-- Rebuild the status CHECK constraint around the new canonical set.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_status;
ALTER TABLE tickets ADD CONSTRAINT chk_tickets_status CHECK (status IN ('RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED'));
