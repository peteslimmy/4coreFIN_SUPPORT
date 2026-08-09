-- Landing Page Image Management Module
-- Provides CRUD operations for hero images with versioning and audit logging.
--
-- The main public.landing_page_images table is defined by migration 023 and matches the
-- application's schema (uploaded_by TEXT, nullable, references users.id). This migration
-- provides the supporting versioning and audit tables using the same conventions the app
-- actually uses: performed_by / created_by store the application's TEXT user id (or NULL),
-- and the application writes audit rows itself (no audit trigger), so service-role writes
-- are never aborted by a NULL auth.uid().

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Remove the legacy audit trigger/function if present (would abort service-role writes
-- because auth.uid() is NULL under the service role and performed_by is NOT NULL).
DROP TRIGGER IF EXISTS trigger_landing_page_images_audit ON public.landing_page_images;
DROP FUNCTION IF EXISTS log_landing_page_image_audit();

-- Recreate the versioning/audit tables with the correct column types. They were only just
-- introduced and contain no application data, so dropping and recreating is safe.
DROP TABLE IF EXISTS public.landing_page_image_versions;
DROP TABLE IF EXISTS public.landing_page_image_audit;

-- Image versions table for version history
CREATE TABLE IF NOT EXISTS public.landing_page_image_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    image_id UUID NOT NULL REFERENCES public.landing_page_images(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    mobile_path TEXT,
    desktop_path TEXT,
    alt_text TEXT NOT NULL,
    seo_title TEXT,
    seo_description TEXT,
    change_summary TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log table for landing page images
CREATE TABLE IF NOT EXISTS public.landing_page_image_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    image_id UUID REFERENCES public.landing_page_images(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    performed_by TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address TEXT,
    user_agent TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_landing_page_images_status ON public.landing_page_images(status);
CREATE INDEX IF NOT EXISTS idx_landing_page_images_uploaded_by ON public.landing_page_images(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_landing_page_images_created_at ON public.landing_page_images(created_at);
CREATE INDEX IF NOT EXISTS idx_landing_page_images_version ON public.landing_page_images(version);
CREATE INDEX IF NOT EXISTS idx_landing_page_images_deleted_at ON public.landing_page_images(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_landing_page_image_versions_image_id ON public.landing_page_image_versions(image_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_landing_page_image_versions_created_at ON public.landing_page_image_versions(created_at);

CREATE INDEX IF NOT EXISTS idx_landing_page_image_audit_image_id ON public.landing_page_image_audit(image_id);
CREATE INDEX IF NOT EXISTS idx_landing_page_image_audit_performed_at ON public.landing_page_image_audit(performed_at);
CREATE INDEX IF NOT EXISTS idx_landing_page_image_audit_performed_by ON public.landing_page_image_audit(performed_by);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_landing_page_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_landing_page_images_updated_at ON public.landing_page_images;
CREATE TRIGGER trigger_landing_page_images_updated_at
    BEFORE UPDATE ON public.landing_page_images
    FOR EACH ROW
    EXECUTE FUNCTION update_landing_page_images_updated_at();

-- RLS Policies
ALTER TABLE public.landing_page_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_image_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_image_audit ENABLE ROW LEVEL SECURITY;

-- Service role has full access (the application uses the service role for all data access)
CREATE POLICY "Service role full access" ON public.landing_page_images
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access versions" ON public.landing_page_image_versions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access audit" ON public.landing_page_image_audit
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can view published images
CREATE POLICY "Authenticated users can view published images" ON public.landing_page_images
    FOR SELECT TO authenticated USING (
        status = 'published' AND deleted_at IS NULL
    );

-- Anonymous users can view published images
CREATE POLICY "Anonymous users can view published images" ON public.landing_page_images
    FOR SELECT TO anon USING (
        status = 'published' AND deleted_at IS NULL
    );

-- Versions are readable by authenticated users
CREATE POLICY "Authenticated users can view versions" ON public.landing_page_image_versions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anonymous users can view versions" ON public.landing_page_image_versions
    FOR SELECT TO anon USING (true);

-- Audit is insertable by service role (the app writes audit rows via the service role)
CREATE POLICY "Service role can insert audit" ON public.landing_page_image_audit
    FOR INSERT TO service_role WITH CHECK (true);

-- Comments
COMMENT ON TABLE public.landing_page_images IS 'Stores hero images for the landing page with versioning and metadata';
COMMENT ON TABLE public.landing_page_image_versions IS 'Historical versions of landing page images for rollback capability';
COMMENT ON TABLE public.landing_page_image_audit IS 'Audit log for all landing page image operations';
