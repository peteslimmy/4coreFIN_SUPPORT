-- 4CoreFinSupport — SLA pause/resume
-- Migration 048: Track paused SLA time while a ticket waits on a customer,
-- partner, or internal dependency. The base sla_deadline never moves; the
-- effective deadline is computed as:
--   sla_deadline + sla_paused_ms + (now - sla_pause_started_at while waiting)
-- This keeps the SLA math auditable (the original target is preserved) while
-- waiting states stop the clock.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_paused_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_pause_started_at TIMESTAMPTZ;

-- Backfill: tickets currently in a waiting state start their pause now.
UPDATE tickets
SET sla_pause_started_at = COALESCE(sla_pause_started_at, NOW())
WHERE status IN ('WAITING_CUSTOMER', 'WAITING_PARTNER', 'WAITING_INTERNAL')
  AND is_deleted = false;

COMMENT ON COLUMN tickets.sla_paused_ms IS 'Accumulated SLA pause time in milliseconds across all waiting episodes.';
COMMENT ON COLUMN tickets.sla_pause_started_at IS 'Set while the ticket is in a WAITING_* status; cleared on resume.';
