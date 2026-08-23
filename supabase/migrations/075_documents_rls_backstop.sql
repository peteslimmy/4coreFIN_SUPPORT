-- 4CoreFinSupport — RLS Backstop for the documents schema
-- Migration 075: extends the deny-by-default tenant isolation backstop
-- (migration 010) to the document management domain added in migration 061.
--
-- The Node server connects with the service role (BYPASSRLS), so this does
-- NOT gate the application. It is defence-in-depth: any direct database
-- access (Supabase SQL editor, anon/authenticated keys, misconfigured
-- clients) must be scoped to exactly one tenant.
--
-- documents.document_versions and documents.document_permissions have no
-- tenant_id column; they are scoped through their parent document_id, so
-- their policies require that the referenced document row is visible.

-- ─── document_folders ───────────────────────────────────────────────────────
ALTER TABLE documents.document_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_folders_select ON documents.document_folders;
CREATE POLICY document_folders_select ON documents.document_folders
  FOR SELECT USING (tenant_visible(tenant_id));
DROP POLICY IF EXISTS document_folders_insert ON documents.document_folders;
CREATE POLICY document_folders_insert ON documents.document_folders
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS document_folders_update ON documents.document_folders;
CREATE POLICY document_folders_update ON documents.document_folders
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS document_folders_delete ON documents.document_folders;
CREATE POLICY document_folders_delete ON documents.document_folders
  FOR DELETE USING (tenant_visible(tenant_id));

-- ─── document_registry ──────────────────────────────────────────────────────
ALTER TABLE documents.document_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_registry_select ON documents.document_registry;
CREATE POLICY document_registry_select ON documents.document_registry
  FOR SELECT USING (tenant_visible(tenant_id));
DROP POLICY IF EXISTS document_registry_insert ON documents.document_registry;
CREATE POLICY document_registry_insert ON documents.document_registry
  FOR INSERT WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS document_registry_update ON documents.document_registry;
CREATE POLICY document_registry_update ON documents.document_registry
  FOR UPDATE USING (tenant_visible(tenant_id)) WITH CHECK (tenant_visible(tenant_id));
DROP POLICY IF EXISTS document_registry_delete ON documents.document_registry;
CREATE POLICY document_registry_delete ON documents.document_registry
  FOR DELETE USING (tenant_visible(tenant_id));

-- ─── document_versions (scoped via parent document) ─────────────────────────
ALTER TABLE documents.document_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_versions_select ON documents.document_versions;
CREATE POLICY document_versions_select ON documents.document_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents.document_registry d
      WHERE d.id = document_versions.document_id
        AND tenant_visible(d.tenant_id)
    )
  );
DROP POLICY IF EXISTS document_versions_insert ON documents.document_versions;
CREATE POLICY document_versions_insert ON documents.document_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents.document_registry d
      WHERE d.id = document_versions.document_id
        AND tenant_visible(d.tenant_id)
    )
  );
DROP POLICY IF EXISTS document_versions_update ON documents.document_versions;
CREATE POLICY document_versions_update ON documents.document_versions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM documents.document_registry d
      WHERE d.id = document_versions.document_id
        AND tenant_visible(d.tenant_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents.document_registry d
      WHERE d.id = document_versions.document_id
        AND tenant_visible(d.tenant_id)
    )
  );
DROP POLICY IF EXISTS document_versions_delete ON documents.document_versions;
CREATE POLICY document_versions_delete ON documents.document_versions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM documents.document_registry d
      WHERE d.id = document_versions.document_id
        AND tenant_visible(d.tenant_id)
    )
  );

-- ─── document_permissions (scoped via parent document) ──────────────────────
ALTER TABLE documents.document_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_permissions_select ON documents.document_permissions;
CREATE POLICY document_permissions_select ON documents.document_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents.document_registry d
      WHERE d.id = document_permissions.document_id
        AND tenant_visible(d.tenant_id)
    )
  );
DROP POLICY IF EXISTS document_permissions_insert ON documents.document_permissions;
CREATE POLICY document_permissions_insert ON documents.document_permissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents.document_registry d
      WHERE d.id = document_permissions.document_id
        AND tenant_visible(d.tenant_id)
    )
  );
DROP POLICY IF EXISTS document_permissions_update ON documents.document_permissions;
CREATE POLICY document_permissions_update ON documents.document_permissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM documents.document_registry d
      WHERE d.id = document_permissions.document_id
        AND tenant_visible(d.tenant_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents.document_registry d
      WHERE d.id = document_permissions.document_id
        AND tenant_visible(d.tenant_id)
    )
  );
DROP POLICY IF EXISTS document_permissions_delete ON documents.document_permissions;
CREATE POLICY document_permissions_delete ON documents.document_permissions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM documents.document_registry d
      WHERE d.id = document_permissions.document_id
        AND tenant_visible(d.tenant_id)
    )
  );
