-- 4CoreFinSupport — Partner organizations
-- Migration 035: Create partner_organizations table, add partner_org_id FK on tickets,
-- and migrate existing partner string data to the new table.

-- Partner organizations table
CREATE TABLE IF NOT EXISTS partner_organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'standard',
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lookups by name/tier
CREATE INDEX IF NOT EXISTS idx_partner_organizations_name ON partner_organizations (lower(name));
CREATE INDEX IF NOT EXISTS idx_partner_organizations_tier ON partner_organizations (tier);

-- Migrate existing partner string values from tickets into partner_organizations
-- and set partner_org_id. This is idempotent: re-running won't duplicate rows.

-- Ensure the partner_org_id column exists on tickets (add if missing, via ALTER TABLE)
-- The column may already exist from a prior partial migration; this is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'partner_org_id'
  ) THEN
    ALTER TABLE tickets ADD COLUMN partner_org_id INTEGER;
  END IF;
END
$$;

-- Populate partner_organizations from the distinct partner strings in tickets,
-- and set partner_org_id on each ticket accordingly.
WITH distinct_partners AS (
  SELECT DISTINCT partner AS partner_name
  FROM tickets
  WHERE partner IS NOT NULL AND partner != ''
),
new_orgs AS (
  INSERT INTO partner_organizations (name, tier, status)
  SELECT partner_name, 'standard', 'active'
  FROM distinct_partners
  ON CONFLICT (name) DO NOTHING
  RETURNING id, name
)
UPDATE tickets
SET partner_org_id = orgs.id
FROM new_orgs orgs
WHERE tickets.partner = orgs.name
  AND tickets.partner_org_id IS NULL;

-- Make partner_org_id non-nullable after backfill (optional, can be done in a later migration)
-- ALTER TABLE tickets ALTER COLUMN partner_org_id SET NOT NULL;

-- Keep the partner column for backward compatibility; it will be deprecated once
-- all consumers use partner_org_id. A trigger could future-sync partner_org_id
-- from partner on insert, but that is beyond the scope of this migration.
COMMENT ON COLUMN tickets.partner_org_id IS 'FK to partner_organizations; populated by migration 035.';
COMMENT ON COLUMN tickets.partner IS 'Legacy partner name; kept for backward compatibility.';