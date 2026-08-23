-- 4CoreFinSupport — Access scopes (ABAC foundation)
-- Migration 056: Explicit BU/partner scope assignments for authorization.
-- Backfills from existing users.bu and users.partner columns.

CREATE TABLE IF NOT EXISTS identity.access_scopes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type  TEXT NOT NULL CHECK (scope_type IN ('business_unit', 'payment_partner', 'organization')),
  scope_id    TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_access_scopes_user ON identity.access_scopes (user_id);
CREATE INDEX IF NOT EXISTS idx_access_scopes_type_id ON identity.access_scopes (scope_type, scope_id);

-- RLS
ALTER TABLE identity.access_scopes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'access_scopes_service_all' AND tablename = 'access_scopes' AND schemaname = 'identity') THEN
    CREATE POLICY "access_scopes_service_all" ON identity.access_scopes FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'access_scopes_auth_read' AND tablename = 'access_scopes' AND schemaname = 'identity') THEN
    CREATE POLICY "access_scopes_auth_read" ON identity.access_scopes FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Backfill from existing users.bu column (BU-scoped users)
INSERT INTO identity.access_scopes (user_id, scope_type, scope_id)
SELECT DISTINCT id, 'business_unit', bu
FROM users
WHERE bu IS NOT NULL AND bu != '' AND bu != 'ALL'
  AND NOT EXISTS (
    SELECT 1 FROM identity.access_scopes
    WHERE user_id = users.id AND scope_type = 'business_unit' AND scope_id = users.bu
  )
ON CONFLICT (user_id, scope_type, scope_id) DO NOTHING;

-- Backfill from existing users.partner column (Partner-scoped users)
INSERT INTO identity.access_scopes (user_id, scope_type, scope_id)
SELECT DISTINCT id, 'payment_partner', partner
FROM users
WHERE partner IS NOT NULL AND partner != ''
  AND NOT EXISTS (
    SELECT 1 FROM identity.access_scopes
    WHERE user_id = users.id AND scope_type = 'payment_partner' AND scope_id = users.partner
  )
ON CONFLICT (user_id, scope_type, scope_id) DO NOTHING;
