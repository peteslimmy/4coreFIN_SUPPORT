CREATE TABLE IF NOT EXISTS landing_page_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  mobile_path TEXT,
  desktop_path TEXT,
  alt_text TEXT DEFAULT '',
  seo_title TEXT DEFAULT '',
  seo_description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived', 'deleted')),
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_landing_images_status ON landing_page_images(status);
CREATE INDEX IF NOT EXISTS idx_landing_images_uploaded_by ON landing_page_images(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_landing_images_created_at ON landing_page_images(created_at);

ALTER TABLE landing_page_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all landing page images"
  ON landing_page_images FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view published images"
  ON landing_page_images FOR SELECT
  USING (status = 'published');

CREATE OR REPLACE FUNCTION update_landing_page_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_landing_page_images_updated_at ON landing_page_images;
CREATE TRIGGER trg_landing_page_images_updated_at
  BEFORE UPDATE ON landing_page_images
  FOR EACH ROW
  EXECUTE FUNCTION update_landing_page_images_updated_at();