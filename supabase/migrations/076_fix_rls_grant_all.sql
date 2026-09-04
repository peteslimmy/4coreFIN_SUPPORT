-- 4CoreFinSupport — RLS grant-all remediation (review findings DB-02)
-- Fixes two live fail-open policies that were already applied to existing
-- environments. Fix-forward per the 050/051/052 convention: applied migrations
-- are tracked by filename and must never be edited in place.
--
-- Hole 1 — watcher_notifications (from 032):
--   tenant_id = coalesce(current_setting('app.tenant_id', true), tenant_id)
--   degenerates to tenant_id = tenant_id (grant-all) whenever app.tenant_id is
--   unset, which is always in the current architecture. Replaced with a
--   deny-by-default policy consistent with tenant_visible() from 010.
--
-- Hole 2 — landing_page_images (from 023):
--   "Super admins can manage all landing page images" is FOR ALL USING (true)
--   WITH NO `TO` clause, so it applies to anon/authenticated too. Anyone with
--   the public anon key could UPDATE/DELETE landing-page images over PostgREST.
--   Replaced with an explicit service_role-only policy.

-- ── watcher_notifications ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "watcher_notifications_tenant_isolation" ON watcher_notifications;
CREATE POLICY "watcher_notifications_tenant_isolation" ON watcher_notifications
  FOR ALL USING (
    auth.role() = 'service_role'
    OR (
      current_setting('app.tenant_id', true) IS NOT NULL
      AND current_setting('app.tenant_id', true) <> ''
      AND tenant_id = current_setting('app.tenant_id', true)
    )
  ) WITH CHECK (
    auth.role() = 'service_role'
    OR (
      current_setting('app.tenant_id', true) IS NOT NULL
      AND current_setting('app.tenant_id', true) <> ''
      AND tenant_id = current_setting('app.tenant_id', true)
    )
  );

-- ── landing_page_images ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Super admins can manage all landing page images" ON landing_page_images;
CREATE POLICY "Service role manages all landing page images"
  ON landing_page_images FOR ALL TO service_role
  USING (true) WITH CHECK (true);