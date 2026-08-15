-- 038_webhook_tables.sql
-- Adds webhook_deliveries table and reconciles the existing webhooks table.
-- Note: the 'webhooks' table already exists from a prior partial apply;
--       we ALTER it to add missing columns rather than re-creating it.
-- Tenant isolation and RLS policies are applied in the deployment SQL
-- (executed with auth.uid context) rather than here, because the
-- Management API SQL runner uses superuser with no auth session.

-- Add tenant_id to webhooks
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Add updated_at tracking column
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- webhook_deliveries: records every dispatch attempt with response details
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      TEXT      NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type      TEXT      NOT NULL,
  response_status INTEGER,
  response_body   TEXT,
  error           TEXT,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_tenant          ON webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active          ON webhooks(is_active);
CREATE INDEX IF NOT EXISTS idx_deliveries_webhook       ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_event         ON webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_deliveries_webhook_event ON webhook_deliveries(webhook_id, event_type);