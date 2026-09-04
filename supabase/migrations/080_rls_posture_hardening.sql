-- 4CoreFinSupport — RLS posture hardening for the user-JWT transition (SEC-01)
-- Phase 4 prep (review finding SEC-01/DB-02/DB-05):
--
-- The app is migrating from a single service-role client (which bypasses RLS)
-- to per-request user-JWT clients, where RLS becomes the REAL authorization
-- boundary. That transition is only safe if the policy set is deny-by-default
-- for non-service roles. These tables either had RLS disabled entirely or
-- shipped an anon-granting policy. Fixing both now so no user-context read
-- can ever leak.
--
-- 1) landing_page_image_versions: migration 022 granted SELECT to anon with
--    USING (true), which exposes EVERY version row — including rows whose
--    parent image is a draft or deleted — to any anonymous internet caller
--    with the public anon key. Replaced by a service_role full policy plus an
--    authenticated select that is narrowed to versions of PUBLISHED images.
-- 2) Public-schema operational tables with RLS disabled: enable it and grant a
--    service-role full policy. Service-role operations are unaffected; any
--    future authenticated/anon access is denied by default.

-- ── landing_page_image_versions: close the anonymous draft-version exposure ──
DROP POLICY IF EXISTS "Anonymous users can view versions" ON public.landing_page_image_versions;
DROP POLICY IF EXISTS "Authenticated users can view versions" ON public.landing_page_image_versions;

CREATE POLICY "Service role manages landing page versions"
  ON public.landing_page_image_versions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users may list versions only for images that are currently
-- published, so draft/archived/deleted image internals never leak through the
-- public PostgREST surface via the versions table.
CREATE POLICY "Authenticated can view versions of published images"
  ON public.landing_page_image_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.landing_page_images img
      WHERE img.id = image_id
        AND img.status = 'published'
        AND img.deleted_at IS NULL
    )
  );

-- ── RLS-enable the remaining public-schema operational tables ──────────────
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE erasure_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pii_encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_id_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages business_hours" ON business_hours
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role manages erasure_requests" ON erasure_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role manages pii_encryption_keys" ON pii_encryption_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role manages sla_notification_log" ON sla_notification_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role manages escalation_notification_log" ON escalation_notification_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role manages ticket_id_counters" ON ticket_id_counters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON POLICY "Authenticated can view versions of published images"
  ON public.landing_page_image_versions
  IS 'Versions only visible to authenticated users when the parent image is published (SEC-01).';