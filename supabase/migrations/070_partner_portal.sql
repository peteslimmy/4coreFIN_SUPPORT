-- 4CoreFinSupport — Partner Portal
-- Migration 070: Dedicated partner portal backend tables

CREATE SCHEMA IF NOT EXISTS partner_portal;

-- Partner metrics view: aggregates ticket count, avg resolution time, SLA compliance by partner
-- Resolution timestamps live in the rca_details JSONB (rcaDetails.resolvedAt,
-- written by ticketStateMachine on RESOLVED) — there is no resolved_at column.
CREATE OR REPLACE VIEW partner_portal.partner_metrics AS
SELECT
  t.partner AS partner_id,
  COUNT(*) AS total_tickets,
  COUNT(*) FILTER (WHERE t.status IN ('RESOLVED', 'CLOSED')) AS resolved_tickets,
  AVG(
    CASE
      WHEN t.rca_details->>'resolvedAt' IS NOT NULL AND t.created_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM ((t.rca_details->>'resolvedAt')::timestamptz - t.created_at)) / 3600
      ELSE NULL
    END
  ) AS avg_resolution_hours,
  COUNT(*) FILTER (WHERE t.sla_deadline IS NOT NULL AND t.rca_details->>'resolvedAt' IS NOT NULL AND (t.rca_details->>'resolvedAt')::timestamptz <= t.sla_deadline) AS sla_met_count,
  COUNT(*) FILTER (WHERE t.sla_deadline IS NOT NULL) AS sla_tracked_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE t.sla_deadline IS NOT NULL AND t.rca_details->>'resolvedAt' IS NOT NULL) > 0
    THEN ROUND(
      100.0 * COUNT(*) FILTER (WHERE t.sla_deadline IS NOT NULL AND t.rca_details->>'resolvedAt' IS NOT NULL AND (t.rca_details->>'resolvedAt')::timestamptz <= t.sla_deadline)
      / COUNT(*) FILTER (WHERE t.sla_deadline IS NOT NULL AND t.rca_details->>'resolvedAt' IS NOT NULL),
      2
    )
    ELSE NULL
  END AS sla_compliance_pct
FROM tickets t
WHERE t.is_deleted = false
  AND t.partner IS NOT NULL
  AND t.partner != ''
GROUP BY t.partner;

-- Partner scorecards table
CREATE TABLE IF NOT EXISTS partner_portal.partner_scorecards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          TEXT NOT NULL,
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  total_tickets       INTEGER DEFAULT 0,
  resolved_tickets    INTEGER DEFAULT 0,
  breached_tickets    INTEGER DEFAULT 0,
  avg_resolution_hours NUMERIC,
  sla_compliance_pct  NUMERIC,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(partner_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_partner_scorecards_partner ON partner_portal.partner_scorecards (partner_id);

-- Saved replies table
CREATE TABLE IF NOT EXISTS partner_portal.saved_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_replies_partner ON partner_portal.saved_replies (partner_id);
