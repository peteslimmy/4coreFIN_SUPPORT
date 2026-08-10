-- 4CoreFinSupport — Rename "provider" → "partner"
-- The product calls payment providers "partners". This migration renames the
-- column across all tables, updates dependent indexes, migrates the app_config
-- key, and remaps the roles (PROVIDER → PARTNER, old PARTNER → CUSTOMER).

-- ─── 1. Rename columns ──────────────────────────────────────────────────
ALTER TABLE tickets RENAME COLUMN provider TO partner;
ALTER TABLE major_incidents RENAME COLUMN provider TO partner;
ALTER TABLE ticket_templates RENAME COLUMN provider TO partner;
ALTER TABLE kb_articles RENAME COLUMN provider TO partner;

-- ─── 2. Rename dependent indexes ────────────────────────────────────────
ALTER INDEX IF EXISTS idx_tickets_provider RENAME TO idx_tickets_partner;
ALTER INDEX IF EXISTS idx_tickets_tenant_provider RENAME TO idx_tickets_tenant_partner;
ALTER INDEX IF EXISTS idx_major_incidents_tenant_provider RENAME TO idx_major_incidents_tenant_partner;

-- ─── 3. Migrate app_config key ──────────────────────────────────────────
UPDATE app_config SET key = 'partners' WHERE key = 'providers';

-- ─── 4. Remap roles ─────────────────────────────────────────────────────
-- PROVIDER was the payment-partner role → PARTNER.
-- Old PARTNER (customer-style bu-scoped role) → CUSTOMER.
UPDATE users SET role = 'PARTNER' WHERE role = 'PROVIDER';
UPDATE users SET role = 'CUSTOMER' WHERE role = 'PARTNER';
UPDATE audit_logs SET role = 'PARTNER' WHERE role = 'PROVIDER';
UPDATE audit_logs SET role = 'CUSTOMER' WHERE role = 'PARTNER';
UPDATE comments SET role = 'PARTNER' WHERE role = 'PROVIDER';
UPDATE comments SET role = 'CUSTOMER' WHERE role = 'PARTNER';
UPDATE tickets SET submitted_by = 'PARTNER' WHERE submitted_by = 'PROVIDER';

-- ─── 5. Refresh role CHECK constraint ───────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users ADD CONSTRAINT chk_users_role
  CHECK (role IN ('SUPER_ADMIN', 'BU_SUPPORT', 'PARTNER', 'EXECUTIVE', 'CUSTOMER'));

-- Verify column renames
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE table_name IN ('tickets','major_incidents','ticket_templates','kb_articles')
--   AND column_name = 'partner';
