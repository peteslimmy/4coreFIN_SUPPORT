-- 4CoreFinSupport — Audit advisory lock exposure for PostgREST (migration 081)
--
-- server/repositories/auditLogRepository.ts calls
--   supabase.rpc('pg_advisory_xact_lock', { key: 0x41554449 })
-- to serialize hash-chained audit writes. pg_advisory_xact_lock() lives in
-- pg_catalog, which PostgREST does not expose — only functions in the exposed
-- schema (public) are RPC-callable. The call therefore failed with
-- "Could not find the function public.pg_advisory_xact_lock(key) in the
-- schema cache", which (before the repository fallback was hardened) failed
-- the entire audit write.
--
-- This migration creates a thin public wrapper so the RPC resolves. It is a
-- best-effort serialization aid: PostgREST runs each RPC in its own
-- transaction, so the transaction-scoped lock is released as soon as the RPC
-- returns. True cross-process serialization still relies on the in-process
-- audit queue; see the KNOWN LIMITATION note in auditLogRepository.ts.
--
-- Idempotent: safe to re-run (CREATE OR REPLACE / IF EXISTS).

CREATE OR REPLACE FUNCTION public.pg_advisory_xact_lock(key bigint)
RETURNS void
LANGUAGE sql
VOLATILE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(key);
$$;

COMMENT ON FUNCTION public.pg_advisory_xact_lock(bigint) IS
  'PostgREST-exposed wrapper around pg_catalog.pg_advisory_xact_lock for audit-write serialization (key 0x41554449 = AUDI).';

-- Functions default to EXECUTE for PUBLIC; tighten per the hardening posture
-- in migration 080 so anonymous callers cannot acquire advisory locks.
REVOKE ALL ON FUNCTION public.pg_advisory_xact_lock(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pg_advisory_xact_lock(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.pg_advisory_xact_lock(bigint)
  TO service_role, authenticated, postgres;