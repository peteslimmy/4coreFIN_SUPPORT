-- 4CoreFinSupport — Partner organization FK on users
-- Migration 044: Give PARTNER accounts a foreign key to partner_organizations
-- so partner scoping uses a stable integer identity instead of fragile
-- case-insensitive string matching on the partner name.

-- 1. Column + FK
ALTER TABLE users ADD COLUMN IF NOT EXISTS partner_org_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_users_partner_org'
      AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT fk_users_partner_org
      FOREIGN KEY (partner_org_id) REFERENCES partner_organizations(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_users_partner_org ON users(partner_org_id);

-- 2. Backfill: match PARTNER accounts to their organization by name
--    (users.partner, falling back to legacy users.bu).
WITH partner_users AS (
  SELECT id,
         COALESCE(NULLIF(trim(partner), ''), NULLIF(trim(bu), '')) AS partner_name
  FROM users
  WHERE role = 'PARTNER'
)
UPDATE users u
SET partner_org_id = po.id
FROM partner_users pu
JOIN partner_organizations po
  ON lower(trim(po.name)) = lower(trim(pu.partner_name))
WHERE u.id = pu.id
  AND u.partner_org_id IS NULL;

-- 3. Keep tickets.partner_org_id in sync when a ticket names a partner that
--    already has an organization row (covers rows created since 035).
UPDATE tickets t
SET partner_org_id = po.id
FROM partner_organizations po
WHERE lower(trim(t.partner)) = lower(trim(po.name))
  AND t.partner_org_id IS NULL
  AND t.partner IS NOT NULL
  AND t.partner <> '';

COMMENT ON COLUMN users.partner_org_id IS 'FK to partner_organizations for PARTNER accounts; NULL for internal roles. Backfilled by name; new partner users should be provisioned with it directly.';
