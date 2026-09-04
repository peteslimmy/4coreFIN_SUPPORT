-- 4CoreFinSupport — Atomic failed-login accounting (SEC-05 / H7)
-- recordFailedLogin previously did read-modify-write, so two concurrent failed
-- logins could both read N and write N+1, never reaching the lock threshold.
-- This RPC increments atomically and sets locked_until in the same statement
-- path. Constants mirror the app: MAX_FAILED_ATTEMPTS = 5, LOCKOUT = 15 minutes.

CREATE OR REPLACE FUNCTION public.record_failed_login(p_user_id TEXT)
RETURNS TABLE (attempts INTEGER, locked_until TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempts INTEGER;
  v_locked_until TIMESTAMPTZ;
BEGIN
  UPDATE users
     SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
         last_failed_login = now()
   WHERE id = p_user_id
  RETURNING users.failed_login_attempts INTO v_attempts;

  IF v_attempts IS NULL THEN
    -- User row vanished between select and update.
    RETURN;
  END IF;

  IF v_attempts >= 5 THEN
    v_locked_until := now() + INTERVAL '15 minutes';
    UPDATE users SET locked_until = v_locked_until WHERE id = p_user_id;
  END IF;

  attempts := v_attempts;
  locked_until := v_locked_until;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login(TEXT) TO service_role;