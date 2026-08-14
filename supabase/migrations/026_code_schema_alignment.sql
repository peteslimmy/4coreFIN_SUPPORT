-- 4CoreFinSupport — Align live schema with application code.
--
-- The app (and migrations history) renamed "provider" → "partner" and expects
-- `users.partner` / `users.account_type`. The live project stopped at migration
-- 024, so these columns are still named `provider` and the users columns are
-- missing entirely. This migration closes the gap idempotently:
--   1. rename provider → partner on tickets / major_incidents / ticket_templates / kb_articles
--   2. rename dependent indexes
--   3. drop the stale app_config 'providers' key
--   4. add users.partner and users.account_type (with backfill + indexes)
--   5. rebuild chk_users_role with every role the app can provision
--   6. harden RLS: no anonymous CRUD on landing_page_images, no public SELECT
--      on system_settings (the app reads those through the service-role API)

-- ─── 1. Column renames (idempotent) ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='provider') THEN
    ALTER TABLE public.tickets RENAME COLUMN provider TO partner;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='major_incidents' AND column_name='provider') THEN
    ALTER TABLE public.major_incidents RENAME COLUMN provider TO partner;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_templates' AND column_name='provider') THEN
    ALTER TABLE public.ticket_templates RENAME COLUMN provider TO partner;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kb_articles' AND column_name='provider') THEN
    ALTER TABLE public.kb_articles RENAME COLUMN provider TO partner;
  END IF;
END $$;

-- ─── 2. Index renames ──────────────────────────────────────────────────
ALTER INDEX IF EXISTS idx_tickets_provider RENAME TO idx_tickets_partner;
ALTER INDEX IF EXISTS idx_tickets_tenant_provider RENAME TO idx_tickets_tenant_partner;
ALTER INDEX IF EXISTS idx_major_incidents_tenant_provider RENAME TO idx_major_incidents_tenant_partner;

-- ─── 3. app_config: stale providers key ────────────────────────────────
DELETE FROM app_config WHERE key = 'providers';

-- ─── 4. users.partner / users.account_type ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='partner') THEN
    ALTER TABLE public.users ADD COLUMN partner TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='account_type') THEN
    ALTER TABLE public.users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'BU';
  END IF;
END $$;

UPDATE users SET account_type = 'BU' WHERE account_type IS NULL OR account_type = '';
UPDATE users SET account_type = 'PARTNER', partner = CASE WHEN partner = '' THEN bu ELSE partner END WHERE role = 'PARTNER';

CREATE INDEX IF NOT EXISTS idx_users_partner ON users (partner);
CREATE INDEX IF NOT EXISTS idx_users_account_type ON users (account_type);

-- ─── 5. chk_users_role covers every app role ───────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('SUPER_ADMIN','BU_SUPPORT','BU_SUPPORT_L1','BU_SUPPORT_L2','BU_SUPPORT_L3','PARTNER','EXECUTIVE','CUSTOMER'));

-- ─── 6. RLS hardening ──────────────────────────────────────────────────
-- Landing page images: remove the blanket (anonymous/authenticated) full-CRUD
-- policy. Reads of published images stay public; all writes flow through the
-- server (service_role) or explicit admin policy.
DROP POLICY IF EXISTS "Super admins can manage all landing page images" ON public.landing_page_images;

-- system_settings: drop the blanket public SELECT. The app's public endpoints
-- read through the service-role client, so this does not affect /api/public/*.
DROP POLICY IF EXISTS "Public settings are viewable by everyone" ON public.system_settings;