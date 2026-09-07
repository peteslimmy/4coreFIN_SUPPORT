-- 4CoreFinSupport — escalation rules become relational operational data
-- (audit finding: escalation rules previously lived as a JSON blob in the
-- `config` table, mutated via read-merge-write with last-write-wins races).
-- Additive: the config-blob path remains as a read fallback during migration.

CREATE TABLE IF NOT EXISTS escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  action JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS escalation_rules_name_key ON escalation_rules (lower(name));

-- ── RLS: service role manages; authenticated users with tenant scope read ──
ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;

-- Service role (app) bypasses RLS via the service client. These policies
-- govern user-JWT access (SEC-01 client family, prefix user_jwt_).
CREATE POLICY "user_jwt_escalation_rules_read" ON escalation_rules
  FOR SELECT TO authenticated
  USING (TRUE); -- rules are global operational config; row content is non-sensitive

-- Writes are server-only: no INSERT/UPDATE/DELETE policies for authenticated.
