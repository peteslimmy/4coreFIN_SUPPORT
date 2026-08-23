-- 4CoreFinSupport — Search domain
-- Migration 067: Full-text search configuration and search log

CREATE SCHEMA IF NOT EXISTS search;

CREATE TABLE IF NOT EXISTS search.search_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL DEFAULT '',
  query           TEXT NOT NULL,
  entity_types    JSONB DEFAULT '[]',
  result_count    INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_log_query ON search.search_log (query);
CREATE INDEX IF NOT EXISTS idx_search_log_created ON search.search_log (created_at DESC);

CREATE TABLE IF NOT EXISTS search.search_shortcuts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword         TEXT NOT NULL UNIQUE,
  target_url      TEXT NOT NULL,
  description     TEXT DEFAULT '',
  icon            TEXT DEFAULT '',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO search.search_shortcuts (keyword, target_url, description, icon) VALUES
  ('ticket', '/tickets', 'Open Ticket Workspace', 'ticket'),
  ('dashboard', '/executive', 'Executive Dashboard', 'dashboard'),
  ('audit', '/audit', 'Audit Logs', 'audit'),
  ('kb', '/knowledge-base', 'Knowledge Base', 'kb'),
  ('customers', '/customers', 'Customer Directory', 'customers')
ON CONFLICT (keyword) DO NOTHING;
