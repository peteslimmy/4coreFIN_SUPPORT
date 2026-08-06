-- 4CoreFinSupport — Idempotency Keys Table
-- Migration 016: Support for idempotent API requests

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  response_body JSONB NOT NULL,
  response_status INTEGER NOT NULL,
  request_hash TEXT NOT NULL,  -- Hash of request body for validation
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Index for TTL cleanup
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- Index for request hash lookup (optional, for debugging)
CREATE INDEX IF NOT EXISTS idx_idempotency_request_hash ON idempotency_keys(request_hash);

-- RLS: Service role bypasses, but enable for defense in depth
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (app-level enforcement)
CREATE POLICY "Service role only" ON idempotency_keys
  FOR ALL USING (auth.role() = 'service_role');

-- Function to clean expired keys (run via pg_cron or app job)
-- CREATE OR REPLACE FUNCTION clean_expired_idempotency_keys() RETURNS void AS $$
-- BEGIN
--   DELETE FROM idempotency_keys WHERE expires_at < NOW();
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: SELECT cron.schedule('clean-idempotency-keys', '0 3 * * *', 'SELECT clean_expired_idempotency_keys();');