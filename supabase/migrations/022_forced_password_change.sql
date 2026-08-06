-- 4CoreFinSupport — Forced password change on first login
-- Accounts are provisioned only by an administrator, who sets the initial
-- password via Supabase Auth. A newly provisioned (or admin-reset) user must
-- choose their own password before using the app; this flag drives a server-side
-- gate in requireAuth and is cleared by the change-password endpoint.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_must_change_password ON users(must_change_password);
