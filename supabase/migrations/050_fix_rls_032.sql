-- 4CoreFinSupport — Fix RLS policies from 032
-- Migration 050: 032's tickets and comments policies referenced a non-existent
-- `role` column, making the SUPER_ADMIN/EXECUTIVE branch silently evaluate to
-- NULL (policy still served as documentation but was semantically wrong).
-- Replace policies with correct expressions; app continues to use service_role.

DROP POLICY IF EXISTS "tickets_tenant_isolation" ON tickets;
CREATE POLICY "tickets_tenant_isolation" ON tickets
  FOR ALL USING (
    auth.role() = 'service_role' OR
    tenant_id = COALESCE(current_setting('app.tenant_id', true), '')::text
  );

DROP POLICY IF EXISTS "tickets_partner_org_isolation" ON tickets;
CREATE POLICY "tickets_partner_org_isolation" ON tickets
  FOR ALL USING (
    auth.role() = 'service_role' OR
    partner_org_id = COALESCE(current_setting('app.partner_org_id', true), '0')::integer
  );

DROP POLICY IF EXISTS "comments_tenant_isolation" ON comments;
CREATE POLICY "comments_tenant_isolation" ON comments
  FOR ALL USING (
    auth.role() = 'service_role' OR
    tenant_id = COALESCE(current_setting('app.tenant_id', true), '')::text
  );

COMMENT ON POLICY "tickets_tenant_isolation"    ON tickets IS 'Corrected: removed invalid `role` column reference.';
COMMENT ON POLICY "tickets_partner_org_isolation" ON tickets IS 'Corrected: uses app.partner_org_id only; SUPER_ADMIN bypass via service_role.';
COMMENT ON POLICY "comments_tenant_isolation"   ON comments IS 'Corrected: removed invalid `role` column reference.';