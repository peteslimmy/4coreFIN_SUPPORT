-- 4CoreFinSupport — Security events
-- Migration 057: Separate security telemetry from business audit.
-- Provides dedicated security event recording for login, access, and session events.

CREATE SCHEMA IF NOT EXISTS security;

CREATE TABLE IF NOT EXISTS security.events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'MFA_FAILURE',
    'ACCESS_DENIED', 'RATE_LIMIT_TRIGGERED', 'SUSPICIOUS_ACCESS',
    'SESSION_REVOKED', 'PASSWORD_CHANGED', 'ACCOUNT_LOCKED'
  )),
  actor_user_id   TEXT REFERENCES users(id),
  actor_email     TEXT,
  ip_address      INET,
  user_agent      TEXT,
  metadata        JSONB DEFAULT '{}',
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_actor ON security.events (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security.events (event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_occurred ON security.events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_security_events_email ON security.events (actor_email);

-- RLS
ALTER TABLE security.events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'security_events_service_all' AND tablename = 'events' AND schemaname = 'security') THEN
    CREATE POLICY "security_events_service_all" ON security.events FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'security_events_auth_read' AND tablename = 'events' AND schemaname = 'security') THEN
    CREATE POLICY "security_events_auth_read" ON security.events FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;
