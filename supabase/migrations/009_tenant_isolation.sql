-- 4CoreFinSupport — Tenant Isolation
-- Each business unit maps to exactly one tenant (1:1 default).
-- The tenants.business_units[] column supports multi-BU tenants in the future.

-- Deterministic, readable tenant id derived from a business unit.
CREATE OR REPLACE FUNCTION tenant_id_for_bu(bu TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT 'tnt-' || upper(regexp_replace(trim(bu), '[^A-Za-z0-9]', '_', 'g'))
$$;

-- 1. TENANTS
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business_units TEXT[] NOT NULL DEFAULT '{}'
);

-- 2. Global tenant for rows without a resolvable business unit (provider-only users, unmapped items).
INSERT INTO tenants (id, name, business_units)
VALUES ('tnt-global', 'GLOBAL', '{}')
ON CONFLICT (id) DO NOTHING;

-- 3. One tenant per distinct business unit across tickets, customers, and non-provider users.
INSERT INTO tenants (id, name, business_units)
SELECT
  tenant_id_for_bu(bu),
  bu,
  ARRAY[bu]
FROM (
  SELECT DISTINCT upper(trim(business_unit)) AS bu FROM tickets WHERE business_unit IS NOT NULL AND trim(business_unit) <> ''
  UNION
  SELECT DISTINCT upper(trim(business_unit)) FROM customers WHERE business_unit IS NOT NULL AND trim(business_unit) <> ''
  UNION
  SELECT DISTINCT upper(trim(bu)) FROM users WHERE role NOT IN ('SUPER_ADMIN', 'EXECUTIVE', 'PROVIDER') AND bu IS NOT NULL AND trim(bu) <> '' AND bu <> 'ALL'
) s
ON CONFLICT (id) DO NOTHING;

-- 4. Add tenant_id columns (nullable for backfill, NOT NULL after).
ALTER TABLE users ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE tickets ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE comments ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE audit_logs ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE watcher_notifications ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE major_incidents ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE customers ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE evidence ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

-- 5. Backfill

-- tickets: direct BU mapping, fallback to global.
UPDATE tickets SET tenant_id = tenant_id_for_bu(business_unit)
WHERE business_unit IS NOT NULL AND trim(business_unit) <> '';
UPDATE tickets SET tenant_id = 'tnt-global' WHERE tenant_id IS NULL;

-- customers: direct BU mapping, fallback to global.
UPDATE customers SET tenant_id = tenant_id_for_bu(business_unit)
WHERE business_unit IS NOT NULL AND trim(business_unit) <> '';
UPDATE customers SET tenant_id = 'tnt-global' WHERE tenant_id IS NULL;

-- comments: inherit from their ticket.
UPDATE comments SET tenant_id = (SELECT t.tenant_id FROM tickets t WHERE t.id = comments.ticket_id)
WHERE ticket_id IS NOT NULL;
UPDATE comments SET tenant_id = 'tnt-global' WHERE tenant_id IS NULL;

-- evidence: inherit from their ticket.
UPDATE evidence SET tenant_id = (SELECT t.tenant_id FROM tickets t WHERE t.id = evidence.ticket_id)
WHERE ticket_id IS NOT NULL;
UPDATE evidence SET tenant_id = 'tnt-global' WHERE tenant_id IS NULL;

-- watcher_notifications: inherit from their ticket.
UPDATE watcher_notifications SET tenant_id = (SELECT t.tenant_id FROM tickets t WHERE t.id = watcher_notifications.ticket_id)
WHERE ticket_id IS NOT NULL;
UPDATE watcher_notifications SET tenant_id = 'tnt-global' WHERE tenant_id IS NULL;

-- audit_logs: from their ticket, else from the actor's tenant, else global.
UPDATE audit_logs SET tenant_id = COALESCE(
  (SELECT t.tenant_id FROM tickets t WHERE t.id = audit_logs.ticket_id),
  (SELECT u.tenant_id FROM users u WHERE u.name = audit_logs.actor ORDER BY u.tenant_id = 'tnt-global' LIMIT 1),
  'tnt-global'
);

-- major_incidents: from a ticket of the same provider, else global.
UPDATE major_incidents SET tenant_id = (
  SELECT t.tenant_id FROM tickets t WHERE t.provider = major_incidents.provider AND t.tenant_id IS NOT NULL LIMIT 1
);
UPDATE major_incidents SET tenant_id = 'tnt-global' WHERE tenant_id IS NULL;

-- users: BU mapping, else provider-of-tickets mapping for PROVIDER role, else global.
UPDATE users SET tenant_id = COALESCE(
  (SELECT id FROM tenants WHERE lower(trim(name)) = lower(trim(users.bu))),
  (SELECT t.tenant_id FROM tickets t WHERE lower(t.provider) = lower(users.bu) LIMIT 1),
  'tnt-global'
);

-- 6. NOT NULL + indexes.
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE comments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE watcher_notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE major_incidents ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE evidence ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_tickets_tenant ON tickets(tenant_id);
CREATE INDEX idx_comments_tenant ON comments(tenant_id);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_notifications_tenant ON watcher_notifications(tenant_id);
CREATE INDEX idx_major_incidents_tenant ON major_incidents(tenant_id);
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_evidence_tenant ON evidence(tenant_id);
