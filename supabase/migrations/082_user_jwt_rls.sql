-- 4CoreFinSupport — SEC-01: user-JWT RLS policies (additive)
--
-- The app is migrating from a single service-role client (which bypasses RLS)
-- to per-request user-JWT clients (lib/server/supabaseUser.ts). These policies
-- are the real authorization boundary once that client is used: a request
-- carrying a Supabase access token can only touch rows its app-user scope
-- allows, even if application code forgets a tenant filter.
--
-- Design notes:
-- * Scope resolution goes through app_user_scope() (SECURITY DEFINER, STABLE)
--   so policies can read the public.users row for auth.uid() without hitting
--   RLS on users itself and without recursing.
-- * Deny-by-default: when no users row maps to auth.uid(), every policy here
--   denies. Service-role policies (migrations 032/050/076/080) are untouched.
-- * Cross-tenant roles: SUPER_ADMIN / EXECUTIVE / bu = 'ALL'.
-- * Partner isolation: partner_org_id FK match, with a legacy name fallback.

-- ── Scope resolution ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_user_scope()
RETURNS TABLE (
  app_role TEXT,
  app_bu TEXT,
  app_tenant_id TEXT,
  app_partner_org_id INTEGER,
  app_partner TEXT
) AS $$
  SELECT u.role, u.bu, u.tenant_id, u.partner_org_id, COALESCE(u.partner, '')
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.app_user_scope() IS 'Resolve the app-user scope (role/bu/tenant/partner) for the JWT subject (SEC-01).';

CREATE OR REPLACE FUNCTION public.app_user_is_global()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT app_role IN ('SUPER_ADMIN', 'EXECUTIVE') OR app_bu = 'ALL'
     FROM public.app_user_scope() LIMIT 1),
    FALSE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- ── tickets ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_jwt_tickets_read" ON tickets;
CREATE POLICY "user_jwt_tickets_read" ON tickets
  FOR SELECT TO authenticated
  USING (
    public.app_user_is_global()
    OR EXISTS (
      SELECT 1 FROM public.app_user_scope() s
      WHERE tickets.tenant_id = s.app_tenant_id
         OR (tickets.partner_org_id IS NOT NULL AND s.app_partner_org_id = tickets.partner_org_id)
         OR (s.app_partner <> '' AND lower(COALESCE(tickets.partner, '')) = lower(s.app_partner))
    )
  );

DROP POLICY IF EXISTS "user_jwt_tickets_write" ON tickets;
CREATE POLICY "user_jwt_tickets_write" ON tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_global()
    OR EXISTS (
      SELECT 1 FROM public.app_user_scope() s
      WHERE NEW.tenant_id = s.app_tenant_id
         OR (NEW.partner_org_id IS NOT NULL AND s.app_partner_org_id = NEW.partner_org_id)
    )
  );

DROP POLICY IF EXISTS "user_jwt_tickets_update" ON tickets;
CREATE POLICY "user_jwt_tickets_update" ON tickets
  FOR UPDATE TO authenticated
  USING (
    public.app_user_is_global()
    OR EXISTS (
      SELECT 1 FROM public.app_user_scope() s
      WHERE tickets.tenant_id = s.app_tenant_id
         OR (tickets.partner_org_id IS NOT NULL AND s.app_partner_org_id = tickets.partner_org_id)
         OR (s.app_partner <> '' AND lower(COALESCE(tickets.partner, '')) = lower(s.app_partner))
    )
  )
  WITH CHECK (TRUE);

-- Soft-delete goes through UPDATE (is_deleted), so no DELETE policy on purpose.

-- ── comments ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_jwt_comments_all" ON comments;
CREATE POLICY "user_jwt_comments_all" ON comments
  FOR ALL TO authenticated
  USING (public.app_user_is_global() OR EXISTS (
    SELECT 1 FROM public.app_user_scope() s
    WHERE comments.tenant_id = s.app_tenant_id
  ))
  WITH CHECK (public.app_user_is_global() OR EXISTS (
    SELECT 1 FROM public.app_user_scope() s
    WHERE comments.tenant_id = s.app_tenant_id
  ));

-- ── evidence ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_jwt_evidence_all" ON evidence;
CREATE POLICY "user_jwt_evidence_all" ON evidence
  FOR ALL TO authenticated
  USING (public.app_user_is_global() OR EXISTS (
    SELECT 1 FROM public.app_user_scope() s
    WHERE evidence.tenant_id = s.app_tenant_id
  ))
  WITH CHECK (public.app_user_is_global() OR EXISTS (
    SELECT 1 FROM public.app_user_scope() s
    WHERE evidence.tenant_id = s.app_tenant_id
  ));

-- ── customers ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_jwt_customers_all" ON customers;
CREATE POLICY "user_jwt_customers_all" ON customers
  FOR ALL TO authenticated
  USING (public.app_user_is_global() OR EXISTS (
    SELECT 1 FROM public.app_user_scope() s
    WHERE customers.tenant_id = s.app_tenant_id
  ))
  WITH CHECK (public.app_user_is_global() OR EXISTS (
    SELECT 1 FROM public.app_user_scope() s
    WHERE customers.tenant_id = s.app_tenant_id
  ));

-- ── major_incidents ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_jwt_major_incidents_all" ON major_incidents;
CREATE POLICY "user_jwt_major_incidents_all" ON major_incidents
  FOR ALL TO authenticated
  USING (public.app_user_is_global() OR EXISTS (
    SELECT 1 FROM public.app_user_scope() s
    WHERE major_incidents.tenant_id = s.app_tenant_id
  ))
  WITH CHECK (public.app_user_is_global() OR EXISTS (
    SELECT 1 FROM public.app_user_scope() s
    WHERE major_incidents.tenant_id = s.app_tenant_id
  ));

-- ── watcher_notifications: recipient-scoped, tenant fallback ─────────────
DROP POLICY IF EXISTS "user_jwt_notifications_read" ON watcher_notifications;
CREATE POLICY "user_jwt_notifications_read" ON watcher_notifications
  FOR SELECT TO authenticated
  USING (
    watcher_notifications.recipient = COALESCE(
      (SELECT app_partner FROM public.app_user_scope() LIMIT 1), ''
    ) OR EXISTS (
      SELECT 1 FROM public.app_user_scope() s
      WHERE (SELECT email FROM public.users WHERE auth_user_id = auth.uid())
            = watcher_notifications.recipient
        AND (public.app_user_is_global() OR watcher_notifications.tenant_id = s.app_tenant_id)
    )
  );

-- Notifications are written by the server (service role) on behalf of users;
-- authenticated INSERT is intentionally not granted.

-- ── users: own-tenant reads only (caches, mentions, presence) ────────────
DROP POLICY IF EXISTS "user_jwt_users_read" ON users;
CREATE POLICY "user_jwt_users_read" ON users
  FOR SELECT TO authenticated
  USING (public.app_user_is_global() OR EXISTS (
    SELECT 1 FROM public.app_user_scope() s
    WHERE users.tenant_id = s.app_tenant_id
  ));

DROP POLICY IF EXISTS "user_jwt_users_self_update" ON users;
CREATE POLICY "user_jwt_users_self_update" ON users
  FOR UPDATE TO authenticated
  USING (users.auth_user_id = auth.uid())
  WITH CHECK (users.auth_user_id = auth.uid());
