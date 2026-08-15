-- 039_webhook_rls.sql
-- Row-level security for webhooks + webhook_deliveries.
--
-- HOW TO APPLY:
--   1. Open the Supabase Dashboard → SQL Editor
--   2. Paste the entire file content
--   3. Click "Run"
--
-- WHY NOT applied via Management API?
-- The Management API SQL executor runs as the postgres superuser without a
-- set_config('app.tenant_id', ...) session variable, so applying RLS through
-- it would immediately break every query including the app's own context switch.
--
-- The RLS here is a defence-in-depth backstop — the Node app already filters
-- every query by tenant_id at the application layer.

-- ── webhooks ──────────────────────────────────────────────────────────────
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhooks_select ON webhooks;
CREATE POLICY webhooks_select ON webhooks
  FOR SELECT USING (tenant_visible(tenant_id));

DROP POLICY IF EXISTS webhooks_insert ON webhooks;
CREATE POLICY webhooks_insert ON webhooks
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));

DROP POLICY IF EXISTS webhooks_update ON webhooks;
CREATE POLICY webhooks_update ON webhooks
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));

DROP POLICY IF EXISTS webhooks_delete ON webhooks;
CREATE POLICY webhooks_delete ON webhooks
  FOR DELETE USING (tenant_visible(tenant_id));

-- ── webhook_deliveries (inherits access via webhook parent) ────────────────
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deliveries_select ON webhook_deliveries;
CREATE POLICY deliveries_select ON webhook_deliveries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM webhooks w
      WHERE w.id = webhook_deliveries.webhook_id
        AND tenant_visible(w.tenant_id)
    )
  );

DROP POLICY IF EXISTS deliveries_insert ON webhook_deliveries;
CREATE POLICY deliveries_insert ON webhook_deliveries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM webhooks w
      WHERE w.id = webhook_deliveries.webhook_id
        AND tenant_visible(w.tenant_id)
    )
  );