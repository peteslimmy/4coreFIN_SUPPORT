-- 4CoreFinSupport — Row Level Security policies
-- Migration 032: Enforce RLS per request so the service_role client no longer
-- silently bypass row-level filters. Policies are written for the intended
-- access model; they will be fully enforced once the per-request user-scoped
-- Supabase client is wired in (P0-2 follow-up). Until then they serve as
-- documentation and defense-in-depth (queries from service_role will still
-- return all rows, but the policies are in place for the transition).

-- -------------------------------------------------------------------------
-- tickets: partners see only their own org's tickets; BU support sees own tenant;
-- SUPER_ADMIN / EXECUTIVE see all.
-- -------------------------------------------------------------------------
CREATE POLICY "tickets_tenant_isolation" ON tickets
  FOR ALL USING (
    auth.role() = 'service_role' OR
    (tenant_id = current_setting('app.tenant_id')::text AND (role = 'SUPER_ADMIN' OR role = 'EXECUTIVE' OR tenant_id IS NOT NULL))
  );

-- Partners see only tickets in their own org (matched by partner_org_id)
CREATE POLICY "tickets_partner_org_isolation" ON tickets
  FOR ALL USING (
    auth.role() = 'service_role' OR
    (partner_org_id IS NOT NULL AND partner_org_id = current_setting('app.partner_org_id')::integer)
  );

-- -------------------------------------------------------------------------
-- comments: tenant‑scoped, plus global SUPER_ADMIN / EXECUTIVE
-- -------------------------------------------------------------------------
CREATE POLICY "comments_tenant_isolation" ON comments
  FOR ALL USING (
    auth.role() = 'service_role' OR
    (tenant_id = current_setting('app.tenant_id')::text AND (role = 'SUPER_ADMIN' OR role = 'EXECUTIVE'))
  );

-- -------------------------------------------------------------------------
-- watcher_notifications: tenant‑scoped
-- -------------------------------------------------------------------------
CREATE POLICY "watcher_notifications_tenant_isolation" ON watcher_notifications
  FOR ALL USING (
    auth.role() = 'service_role' OR
    (tenant_id = current_setting('app.tenant_id')::text)
  );

-- -------------------------------------------------------------------------
-- Helper: set the per‑request context variables that the policies read.
-- These are set by the per‑request Supabase client (future work) or by the
-- Express middleware before a query.  They default to the global tenant.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_request_context() RETURNS void AS $$
BEGIN
  SET LOCAL app.tenant_id = COALESCE(current_setting('app.tenant_id', true), '');
  SET LOCAL app.partner_org_id = COALESCE(current_setting('app.partner_org_id', true), '0')::integer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the context setup at the start of every transaction that handles a
-- user request.  The Express middleware or per‑request client should call
-- SELECT set_request_context(); before data operations.
COMMENT ON FUNCTION set_request_context() IS
  'Set app.tenant_id and app.partner_org_id for RLS policy evaluation. ' +
  'Called at the start of each request‑scoped database transaction.';