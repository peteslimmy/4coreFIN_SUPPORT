-- 4CoreFinSupport — Ticket reference tables & normalization
-- Migration 058: Normalize ticket category, severity, status from TEXT to FK references.
-- Adds version column for optimistic concurrency. Backfills from existing TEXT columns.

CREATE SCHEMA IF NOT EXISTS ticket;

-- Categories
CREATE TABLE IF NOT EXISTS ticket.categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Severities
CREATE TABLE IF NOT EXISTS ticket.severities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- States (workflow lifecycle)
CREATE TABLE IF NOT EXISTS ticket.states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  terminal    BOOLEAN NOT NULL DEFAULT false,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed states
INSERT INTO ticket.states (code, name, terminal, active) VALUES
  ('RECEIPT', 'Receipt', false, true),
  ('ASSIGNED', 'Assigned', false, true),
  ('INVESTIGATE', 'Investigating', false, true),
  ('WAITING_CUSTOMER', 'Waiting Customer', false, true),
  ('WAITING_PARTNER', 'Waiting Partner', false, true),
  ('WAITING_INTERNAL', 'Waiting Internal', false, true),
  ('RESOLVED', 'Resolved', false, true),
  ('CLOSED', 'Closed', true, true)
ON CONFLICT (code) DO NOTHING;

-- Seed categories
INSERT INTO ticket.categories (code, name) VALUES
  ('INCIDENT', 'Incident'),
  ('COMPLAINT', 'Complaint'),
  ('SERVICE_REQUEST', 'Service Request'),
  ('PAYMENT_FAILURE', 'Payment Failure'),
  ('PROBLEM', 'Problem'),
  ('OTHER', 'Other')
ON CONFLICT (code) DO NOTHING;

-- Seed severities
INSERT INTO ticket.severities (code, name, sort_order) VALUES
  ('LOW', 'Low', 1),
  ('MEDIUM', 'Medium', 2),
  ('HIGH', 'High', 3),
  ('CRITICAL', 'Critical', 4)
ON CONFLICT (code) DO NOTHING;

-- RLS for reference tables
ALTER TABLE ticket.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket.severities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket.states ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ticket_categories_service' AND tablename = 'categories' AND schemaname = 'ticket') THEN
    CREATE POLICY "ticket_categories_service" ON ticket.categories FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ticket_severities_service' AND tablename = 'severities' AND schemaname = 'ticket') THEN
    CREATE POLICY "ticket_severities_service" ON ticket.severities FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ticket_states_service' AND tablename = 'states' AND schemaname = 'ticket') THEN
    CREATE POLICY "ticket_states_service" ON ticket.states FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ticket_categories_auth' AND tablename = 'categories' AND schemaname = 'ticket') THEN
    CREATE POLICY "ticket_categories_auth" ON ticket.categories FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ticket_severities_auth' AND tablename = 'severities' AND schemaname = 'ticket') THEN
    CREATE POLICY "ticket_severities_auth" ON ticket.severities FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ticket_states_auth' AND tablename = 'states' AND schemaname = 'ticket') THEN
    CREATE POLICY "ticket_states_auth" ON ticket.states FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Add FK columns to tickets (nullable first)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'category_id') THEN
    ALTER TABLE tickets ADD COLUMN category_id UUID REFERENCES ticket.categories(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'severity_id') THEN
    ALTER TABLE tickets ADD COLUMN severity_id UUID REFERENCES ticket.severities(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'state_id') THEN
    ALTER TABLE tickets ADD COLUMN state_id UUID REFERENCES ticket.states(id);
  END IF;
END $$;

-- Add version column for optimistic concurrency
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'version') THEN
    ALTER TABLE tickets ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Backfill FK columns from existing TEXT columns
UPDATE tickets t
SET category_id = c.id
FROM ticket.categories c
WHERE UPPER(t.category) = UPPER(c.code)
  AND t.category_id IS NULL;

UPDATE tickets t
SET severity_id = s.id
FROM ticket.severities s
WHERE UPPER(t.priority) = UPPER(s.code)
  AND t.severity_id IS NULL;

UPDATE tickets t
SET state_id = st.id
FROM ticket.states st
WHERE UPPER(t.status) = UPPER(st.code)
  AND t.state_id IS NULL;

-- Indexes for new FK columns
CREATE INDEX IF NOT EXISTS idx_tickets_category_id ON tickets (category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_severity_id ON tickets (severity_id);
CREATE INDEX IF NOT EXISTS idx_tickets_state_id ON tickets (state_id);
CREATE INDEX IF NOT EXISTS idx_tickets_version ON tickets (id, version);

-- updated_at triggers
CREATE OR REPLACE FUNCTION ticket.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_categories_updated ON ticket.categories;
CREATE TRIGGER trg_ticket_categories_updated
  BEFORE UPDATE ON ticket.categories
  FOR EACH ROW EXECUTE FUNCTION ticket.update_updated_at();

DROP TRIGGER IF EXISTS trg_ticket_severities_updated ON ticket.severities;
CREATE TRIGGER trg_ticket_severities_updated
  BEFORE UPDATE ON ticket.severities
  FOR EACH ROW EXECUTE FUNCTION ticket.update_updated_at();
