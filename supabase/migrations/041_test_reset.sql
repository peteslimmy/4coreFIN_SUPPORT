-- 4CoreFinSupport — Test Database Reset
-- Migration 041: reset_test_schema() used ONLY by integration tests.
--
-- WARNING — This is deliberately destructive:
--   • Truncates every application table.
--   • Deletes EVERY row in auth.users (which cascades to GoTrue sessions,
--     identities, MFA factors and refresh tokens).
-- It MUST only ever be applied to a dedicated, disposable TEST project. The
-- integration harness (tests/helpers/testDb.ts) enforces this contract, and
-- scripts/prepareTestDb.ts is the only path that applies it.

-- Drop all app tables, then the auth schema identities.
CREATE OR REPLACE FUNCTION public.reset_test_schema()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE TABLE
    webhook_deliveries,
    webhooks,
    landing_page_image_audit,
    landing_page_image_versions,
    landing_page_images,
    idempotency_keys,
    erasure_requests,
    audit_verification_log,
    pii_encryption_keys,
    business_hours,
    partner_organizations,
    audit_logs,
    comments,
    evidence,
    watcher_notifications,
    major_incidents,
    tickets,
    customers,
    api_keys,
    user_profiles,
    users,
    kb_articles,
    ticket_templates,
    holidays,
    sla_rules,
    app_config,
    system_settings
  RESTART IDENTITY CASCADE;

  DELETE FROM auth.users;

  -- Ensure the global tenant always exists so provider-only fixtures work.
  INSERT INTO tenants (id, name, business_units)
  VALUES ('tnt-global', 'GLOBAL', '{}')
  ON CONFLICT (id) DO NOTHING;
END;
$$;