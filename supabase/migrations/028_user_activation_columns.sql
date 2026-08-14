-- 4CoreFinSupport — User activation workflow columns.
--
-- Adds support for user activation workflow:
--   is_active: whether the user account is active (defaults to false for new users)
--   activation_token: token sent via email for account activation
--   activated_at: timestamp when user activated their account
-- Idempotent.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activation_token TEXT,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Create index for activation token lookups
CREATE INDEX IF NOT EXISTS idx_users_activation_token ON users(activation_token) WHERE activation_token IS NOT NULL;

-- Update existing users to be active (they were created before activation workflow)
UPDATE users SET is_active = true WHERE is_active IS NULL OR is_active = false;