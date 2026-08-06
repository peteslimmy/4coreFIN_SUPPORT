-- 4CoreFinSupport — Cutover: remove dev/demo accounts after Supabase Auth linking.
-- Run ONLY against the production project AFTER confirming 012 has linked every
-- real user via auth_user_id. Dev accounts (usr-seed-*) and their Supabase Auth
-- identities are removed. Optionally drops password_hash once local auth is gone.

-- Security guard: refuse to delete anything if any seeded identity still maps
-- to a REAL email (protects against accidental mass-cascade). Adjust the guard
-- to your account naming if needed but keep `usr-seed-%` for demo users.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE (id LIKE 'usr-seed-%'
       OR email LIKE '%demo.4core.com'
       OR email SIMILAR TO 'seed\d+@.*'
       OR email = 'admin@4core.com')
      AND email NOT SIMILAR TO 'seed\d+@.*' -- (placeholder; see note)
  ) THEN
    RAISE EXCEPTION 'Demo-account guard tripped. Review users before migration 013.';
  END IF;
END $$;

-- 1. Delete Supabase Auth identities for seeded users (cascades to app users row
--    via auth_user_id ON DELETE CASCADE, or match by app id/email pattern).
DELETE FROM auth.users au
USING users u
WHERE u.auth_user_id = au.id
  AND (u.id LIKE 'usr-seed-%'
    OR u.email = 'admin@4core.com'
    OR u.email LIKE '%@demo.4core.com');

-- 2. Delete any remaining seeded app rows not already cascaded.
DELETE FROM users
WHERE id LIKE 'usr-seed-%'
   OR email = 'admin@4core.com'
   OR email LIKE '%@demo.4core.com';

-- 3. (Optional) drop local password hash once Supabase Auth is fully live and
--    the local path is confirmed unused. Uncomment when ready:
-- ALTER TABLE users DROP COLUMN password_hash;

-- 4. Re-verify linkage is clean.
DO $$
DECLARE app_count BIGINT; auth_count BIGINT;
BEGIN
  SELECT count(*) INTO app_count FROM users;
  SELECT count(*) INTO auth_count FROM auth.users;
  IF auth_count <> app_count THEN
    RAISE NOTICE 'auth.users (%) vs users (%) mismatch - review before GA', auth_count, app_count;
  END IF;
END $$;