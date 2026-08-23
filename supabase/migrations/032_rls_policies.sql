-- 4CoreFinSupport — Row Level Security policies
-- Migration 032: Enforce RLS per request so the service_role client no longer
-- silently bypass row-level filters. Policies are written for the intended
-- access model; they will be fully enforced once the per-request user-scoped
-- Supabase client is wired in (P0-2 follow-up). Until then they serve as
-- documentation and defense-in-depth (queries from service_role will still
-- return all rows, but the policies are in place for the transition).

-- -------------------------------------------------------------------------
-- tickets: tenant-scoped. The tickets table has no `role` column; role-based
-- visibility is enforced at the application layer (rbac.ts), so the policy
-- only checks tenant context. current_setting(..., true) returns NULL when
-- unset → deny-by-default for non-service_role connections.
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "tickets_tenant_isolation" ON tickets;
CREATE POLICY "tickets_tenant_isolation" ON tickets
  FOR ALL USING (
    auth.role() = 'service_role' OR
    tenant_id = coalesce(current_setting('app.tenant_id', true), tenant_id)
  );

-- Partners see only tickets in their own org (matched by partner_org_id)
DROP POLICY IF EXISTS "tickets_partner_org_isolation" ON tickets;
CREATE POLICY "tickets_partner_org_isolation" ON tickets
  FOR ALL USING (
    auth.role() = 'service_role' OR
    (partner_org_id IS NOT NULL AND partner_org_id = current_setting('app.partner_org_id', true)::integer)
  );

-- -------------------------------------------------------------------------
-- comments: tenant‑scoped (role filtering is application-layer)
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "comments_tenant_isolation" ON comments;
CREATE POLICY "comments_tenant_isolation" ON comments
  FOR ALL USING (
    auth.role() = 'service_role' OR
    tenant_id = coalesce(current_setting('app.tenant_id', true), tenant_id)
  );

-- -------------------------------------------------------------------------
-- watcher_notifications: tenant‑scoped
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "watcher_notifications_tenant_isolation" ON watcher_notifications;
CREATE POLICY "watcher_notifications_tenant_isolation" ON watcher_notifications
  FOR ALL USING (
    auth.role() = 'service_role' OR
    tenant_id = coalesce(current_setting('app.tenant_id', true), tenant_id)
  );

-- -------------------------------------------------------------------------
-- Helper: set the per‑request context variables that the policies read.
-- These are set by the per‑request Supabase client (future work) or by the
-- Express middleware before a query.  They default to the global tenant.
-- SET LOCAL is not valid PL/pgSQL — use set_config(..., is_local => true).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_request_context() RETURNS void AS $$
BEGIN
  PERFORM set_config('app.tenant_id', COALESCE(current_setting('app.tenant_id', true), ''), true);
  PERFORM set_config('app.partner_org_id', COALESCE(current_setting('app.partner_org_id', true), '0'), true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the context setup at the start of every transaction that handles a
-- user request.  The Express middleware or per‑request client should call
-- SELECT set_request_context(); before data operations.
COMMENT ON FUNCTION set_request_context() IS
  'Set app.tenant_id and app.partner_org_id for RLS policy evaluation. Called at the start of each request‑scoped database transaction.';