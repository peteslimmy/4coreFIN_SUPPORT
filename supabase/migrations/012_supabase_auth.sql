-- 4CoreFinSupport — Supabase Auth linking
-- Links each application `users` row to its Supabase Auth identity so that all
-- logins go through Supabase Auth (signInWithPassword) instead of local bcrypt.
-- The legacy password_hash column is retained for the dev/local path and can be
-- dropped in a later cutover migration once production has fully switched.

-- 1. Add the FK column to the app users table.
ALTER TABLE users
  ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Backfill: link existing users to their Supabase Auth identity by email.
--    (idempotent — only links rows that have no auth_user_id yet)
UPDATE users u
SET auth_user_id = au.id
FROM auth.users au
WHERE u.auth_user_id IS NULL
  AND lower(au.email) = lower(u.email);

-- 3. Index for reverse lookups (auth user -> app user).
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

-- 4. Guard: any new login identity must be resolvable to an app user.
--    (Left as a documented operational check; enforced in app code.)
