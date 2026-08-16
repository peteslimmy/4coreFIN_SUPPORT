-- 4CoreFinSupport — Persistent SLA notification dedupe
-- Migration 047: sla_notification_log records every SLA alert the monitor
-- has sent per (kind, ticket, recipient). The UNIQUE constraint makes
-- duplicate suppression a database guarantee instead of process memory —
-- previously a server restart re-fired every alert.
--
-- Retention: rows older than 6 hours are pruned by the monitor each run
-- (matching the previous in-memory TTL), keeping the table tiny.

CREATE TABLE IF NOT EXISTS sla_notification_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('SLA_BREACH', 'SLA_AT_RISK')),
  ticket_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sla_notification UNIQUE (kind, ticket_id, recipient)
);

CREATE INDEX IF NOT EXISTS idx_sla_notification_log_notified_at
  ON sla_notification_log (notified_at);

COMMENT ON TABLE sla_notification_log IS 'Dedupe ledger for SLA monitor alerts; pruned to a 6-hour window by the monitor each run.';
