-- 024: Fix RLS on system_settings
-- Public settings (logo, hero image, theme) must be readable by the public SPA
-- before login so the login page can render brand assets. Authenticated admins
-- can write/update via the service-role server.

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Drop any previously-attempted policies so this migration is idempotent.
DROP POLICY IF EXISTS "Public settings are viewable by everyone" ON system_settings;
DROP POLICY IF EXISTS "Admins can manage system_settings" ON system_settings;

CREATE POLICY "Public settings are viewable by everyone"
  ON system_settings
  FOR SELECT
  USING (true);

-- Writes go through the service-role server, which bypasses RLS. This policy
-- is a defense-in-depth so direct (anon) writes can never happen even if the
-- service key is ever leaked.
CREATE POLICY "Service role manages system_settings"
  ON system_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "Public settings are viewable by everyone" ON system_settings
  IS 'Required so /api/public/settings can read branding + theme before login.';
