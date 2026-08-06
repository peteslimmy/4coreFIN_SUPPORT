-- 4CoreFinSupport — Audit Log Immutability
-- Migration 020: Ensure audit logs are truly immutable

-- Remove UPDATE and DELETE policies (keep only SELECT and INSERT)
DROP POLICY IF EXISTS audit_logs_update ON audit_logs;
DROP POLICY IF EXISTS audit_logs_delete ON audit_logs;

-- Ensure INSERT policy exists
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));

-- Ensure SELECT policy exists
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (tenant_visible(tenant_id));

-- Add trigger to prevent updates/deletes (defense in depth)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be modified';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_protect ON audit_logs;
CREATE TRIGGER audit_logs_protect
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();