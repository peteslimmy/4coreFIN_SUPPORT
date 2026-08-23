-- 4CoreFinSupport — Email ingestion domain
-- Migration 060: Inbound email intake, auto-ticket creation

CREATE SCHEMA IF NOT EXISTS email_ingest;

CREATE TABLE IF NOT EXISTS email_ingest.inbound_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      TEXT NOT NULL UNIQUE,
  from_address    TEXT NOT NULL,
  from_name       TEXT DEFAULT '',
  to_addresses    JSONB NOT NULL DEFAULT '[]',
  cc_addresses    JSONB DEFAULT '[]',
  subject         TEXT NOT NULL DEFAULT '',
  body_text       TEXT DEFAULT '',
  body_html       TEXT DEFAULT '',
  headers         JSONB DEFAULT '{}',
  attachments     JSONB DEFAULT '[]',
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed       BOOLEAN NOT NULL DEFAULT false,
  processed_at    TIMESTAMPTZ,
  ticket_id       UUID,
  error           TEXT,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_processed ON email_ingest.inbound_emails (processed);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_received ON email_ingest.inbound_emails (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_from ON email_ingest.inbound_emails (from_address);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_message ON email_ingest.inbound_emails (message_id);

CREATE TABLE IF NOT EXISTS email_ingest.inbound_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_field     TEXT NOT NULL CHECK (match_field IN ('from', 'to', 'subject', 'body')),
  match_op        TEXT NOT NULL CHECK (match_op IN ('equals', 'contains', 'starts_with', 'ends_with', 'regex')),
  match_value     TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('auto_assign', 'set_category', 'set_priority', 'set_partner', 'ignore')),
  action_value    TEXT NOT NULL DEFAULT '',
  priority        INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_rules_active ON email_ingest.inbound_rules (active, priority DESC);
