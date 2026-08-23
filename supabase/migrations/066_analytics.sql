-- 4CoreFinSupport — Dashboards + SLA analytics
-- Migration 065: Summary tables for server-side analytics

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.sla_daily_snapshot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   DATE NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  total_tickets   INTEGER NOT NULL DEFAULT 0,
  open_tickets    INTEGER NOT NULL DEFAULT 0,
  breached_count  INTEGER NOT NULL DEFAULT 0,
  at_risk_count   INTEGER NOT NULL DEFAULT 0,
  avg_resolution_hours NUMERIC(10,2) DEFAULT 0,
  by_category     JSONB DEFAULT '{}',
  by_priority     JSONB DEFAULT '{}',
  by_bu           JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_date, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_sla_snapshot_date ON analytics.sla_daily_snapshot (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS analytics.ticket_daily_snapshot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   DATE NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  total           INTEGER NOT NULL DEFAULT 0,
  created_count   INTEGER NOT NULL DEFAULT 0,
  resolved_count  INTEGER NOT NULL DEFAULT 0,
  closed_count    INTEGER NOT NULL DEFAULT 0,
  avg_first_response_hours NUMERIC(10,2) DEFAULT 0,
  avg_resolution_hours NUMERIC(10,2) DEFAULT 0,
  by_status       JSONB DEFAULT '{}',
  by_category     JSONB DEFAULT '{}',
  by_priority     JSONB DEFAULT '{}',
  by_bu           JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_date, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_snapshot_date ON analytics.ticket_daily_snapshot (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS analytics.partner_daily_snapshot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   DATE NOT NULL,
  partner_name    TEXT NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  total_tickets   INTEGER NOT NULL DEFAULT 0,
  resolved_count  INTEGER NOT NULL DEFAULT 0,
  breached_count  INTEGER NOT NULL DEFAULT 0,
  avg_resolution_hours NUMERIC(10,2) DEFAULT 0,
  satisfaction_avg NUMERIC(3,2) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_date, partner_name, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_snapshot_date ON analytics.partner_daily_snapshot (snapshot_date DESC);
