-- Add token_version column to users table for JWT session invalidation.
-- When a user changes their password, token_version is incremented, causing
-- all existing JWTs (which embed the previous version) to be rejected by
-- the requireAuth middleware.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
