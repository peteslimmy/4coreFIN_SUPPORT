-- 4CoreFinSupport — RLS Backstop for Multi-Tenant Isolation
-- The Node server connects with the service role (BYPASSRLS), so this file does
-- NOT gate the application. It is a defence-in-depth backstop so that any direct
-- database access (Supabase SQL editor, anon/authenticated keys, misconfigured
-- clients) is always scoped to exactly one tenant — deny-by-default.
--
-- Usage (set the active tenant for a connection before querying):
--   SELECT set_config('app.tenant_id', 'tnt-ALPHA', false);   -- session
--   SELECT set_config('app.tenant_id', 'tnt-global', false);  -- cross-tenant/global role
-- RLS grants access to a row when:
--   row.tenant_id = current_tenant_id()  (own tenant), or
--   current_tenant_id() = 'tnt-global'   (global role).
-- With no tenant set, every policy denies access.

-- Active tenant for the current connection (NULL when unset).
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')
$$;

-- Whether a row's tenant is visible from the connection's active tenant.
CREATE OR REPLACE FUNCTION tenant_visible(row_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT
    current_tenant_id() IS NOT NULL
    AND (
      row_tenant_id = current_tenant_id()
      OR current_tenant_id() = 'tnt-global'
    )
$$;

-- tenants is reference data (id/name/business_units) — readable by any scoped
-- session, mutable only via the service role.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_select ON tenants;
CREATE POLICY tenants_select ON tenants
  FOR SELECT USING (current_tenant_id() IS NOT NULL);

-- ─── tickets ────────────────────────────────────────────────────────────────
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets
  FOR SELECT USING (tenant_visible(tenant_id));
DROP POLICY IF EXISTS tickets_insert ON tickets;
CREATE POLICY tickets_insert ON tickets
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS tickets_update ON tickets;
CREATE POLICY tickets_update ON tickets
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS tickets_delete ON tickets;
CREATE POLICY tickets_delete ON tickets
  FOR DELETE USING (tenant_visible(tenant_id));

-- ─── comments ───────────────────────────────────────────────────────────────
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comments_select ON comments;
CREATE POLICY comments_select ON comments
  FOR SELECT USING (tenant_visible(tenant_id));
DROP POLICY IF EXISTS comments_insert ON comments;
CREATE POLICY comments_insert ON comments
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS comments_update ON comments;
CREATE POLICY comments_update ON comments
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS comments_delete ON comments;
CREATE POLICY comments_delete ON comments
  FOR DELETE USING (tenant_visible(tenant_id));

-- ─── evidence ───────────────────────────────────────────────────────────────
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evidence_select ON evidence;
CREATE POLICY evidence_select ON evidence
  FOR SELECT USING (tenant_visible(tenant_id));
DROP POLICY IF EXISTS evidence_insert ON evidence;
CREATE POLICY evidence_insert ON evidence
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS evidence_update ON evidence;
CREATE POLICY evidence_update ON evidence
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS evidence_delete ON evidence;
CREATE POLICY evidence_delete ON evidence
  FOR DELETE USING (tenant_visible(tenant_id));

-- ─── watcher_notifications ──────────────────────────────────────────────────
ALTER TABLE watcher_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS watcher_notifications_select ON watcher_notifications;
CREATE POLICY watcher_notifications_select ON watcher_notifications
  FOR SELECT USING (tenant_visible(tenant_id));
DROP POLICY IF EXISTS watcher_notifications_insert ON watcher_notifications;
CREATE POLICY watcher_notifications_insert ON watcher_notifications
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS watcher_notifications_update ON watcher_notifications;
CREATE POLICY watcher_notifications_update ON watcher_notifications
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS watcher_notifications_delete ON watcher_notifications;
CREATE POLICY watcher_notifications_delete ON watcher_notifications
  FOR DELETE USING (tenant_visible(tenant_id));

-- ─── major_incidents ────────────────────────────────────────────────────────
ALTER TABLE major_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS major_incidents_select ON major_incidents;
CREATE POLICY major_incidents_select ON major_incidents
  FOR SELECT USING (tenant_visible(tenant_id));
DROP POLICY IF EXISTS major_incidents_insert ON major_incidents;
CREATE POLICY major_incidents_insert ON major_incidents
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS major_incidents_update ON major_incidents;
CREATE POLICY major_incidents_update ON major_incidents
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS major_incidents_delete ON major_incidents;
CREATE POLICY major_incidents_delete ON major_incidents
  FOR DELETE USING (tenant_visible(tenant_id));

-- ─── customers ──────────────────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_select ON customers;
CREATE POLICY customers_select ON customers
  FOR SELECT USING (tenant_visible(tenant_id));
DROP POLICY IF EXISTS customers_insert ON customers;
CREATE POLICY customers_insert ON customers
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS customers_update ON customers;
CREATE POLICY customers_update ON customers
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS customers_delete ON customers;
CREATE POLICY customers_delete ON customers
  FOR DELETE USING (tenant_visible(tenant_id));

-- ─── users ──────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users
  FOR SELECT USING (tenant_visible(tenant_id));
DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS users_delete ON users;
CREATE POLICY users_delete ON users
  FOR DELETE USING (tenant_visible(tenant_id));

-- ─── audit_logs ─────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (tenant_visible(tenant_id));
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS audit_logs_update ON audit_logs;
CREATE POLICY audit_logs_update ON audit_logs
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS audit_logs_delete ON audit_logs;
CREATE POLICY audit_logs_delete ON audit_logs
  FOR DELETE USING (tenant_visible(tenant_id));
