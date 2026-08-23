-- 4CoreFinSupport — Document management domain
-- Migration 061: Document registry with versioning

CREATE SCHEMA IF NOT EXISTS documents;

CREATE TABLE IF NOT EXISTS documents.document_folders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  parent_id       UUID REFERENCES documents.document_folders(id),
  description     TEXT DEFAULT '',
  created_by      TEXT NOT NULL DEFAULT '',
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, parent_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS documents.document_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  folder_id       UUID REFERENCES documents.document_folders(id),
  file_name       TEXT NOT NULL,
  file_size       BIGINT NOT NULL DEFAULT 0,
  file_type       TEXT NOT NULL DEFAULT '',
  mime_type       TEXT NOT NULL DEFAULT '',
  storage_path    TEXT NOT NULL DEFAULT '',
  version         INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  uploaded_by     TEXT NOT NULL DEFAULT '',
  tags            JSONB DEFAULT '[]',
  metadata        JSONB DEFAULT '{}',
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_registry_folder ON documents.document_registry (folder_id);
CREATE INDEX IF NOT EXISTS idx_doc_registry_status ON documents.document_registry (status);
CREATE INDEX IF NOT EXISTS idx_doc_registry_tags ON documents.document_registry USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_doc_registry_title ON documents.document_registry USING GIN (to_tsvector('english', title));

CREATE TABLE IF NOT EXISTS documents.document_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents.document_registry(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  file_name       TEXT NOT NULL,
  file_size       BIGINT NOT NULL DEFAULT 0,
  file_type       TEXT NOT NULL DEFAULT '',
  storage_path    TEXT NOT NULL DEFAULT '',
  change_notes    TEXT DEFAULT '',
  uploaded_by     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON documents.document_versions (document_id);

CREATE TABLE IF NOT EXISTS documents.document_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents.document_registry(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  permission      TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit', 'admin')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, user_id)
);
