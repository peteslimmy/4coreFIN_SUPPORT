-- 4CoreFinSupport — Account Lockout for Brute Force Protection
-- Migration 017: Add lockout tracking columns to users table

-- Add lockout tracking columns
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMPTZ;

-- Index for lockout queries
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_failed_attempts ON users(failed_login_attempts) WHERE failed_login_attempts > 0;

-- Function to check if account is locked
-- CREATE OR REPLACE FUNCTION is_account_locked(user_id TEXT) RETURNS BOOLEAN AS $$
-- DECLARE
--   locked TIMESTAMPTZ;
-- BEGIN
--   SELECT locked_until INTO locked FROM users WHERE id = user_id;
--   RETURN locked IS NOT NULL AND locked > NOW();
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment failed login attempts
-- CREATE OR REPLACE FUNCTION record_failed_login(user_email TEXT) RETURNS VOID AS $$
-- DECLARE
--   attempts INTEGER;
-- BEGIN
--   UPDATE users 
--   SET failed_login_attempts = failed_login_attempts + 1,
--       last_failed_login = NOW(),
--       locked_until = CASE 
--         WHEN failed_login_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
--         ELSE locked_until
--       END
--   WHERE email = user_email
--   RETURNING failed_login_attempts INTO attempts;
--   
--   -- TODO: Send lockout email notification when attempts >= 5
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clear failed attempts on successful login
-- CREATE OR REPLACE FUNCTION clear_failed_logins(user_id TEXT) RETURNS VOID AS $$
-- BEGIN
--   UPDATE users 
--   SET failed_login_attempts = 0, 
--       locked_until = NULL,
--       last_failed_login = NULL
--   WHERE id = user_id;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;