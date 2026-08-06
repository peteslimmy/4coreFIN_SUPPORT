-- 4CoreFinSupport — Supabase PostgreSQL Schema
-- Normalized from better-sqlite3 JSON blob pattern

-- 1. USERS
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  bu TEXT NOT NULL,
  phone TEXT DEFAULT ''
);

-- 2. TICKETS (normalized from JSON blob)
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  customer_phone TEXT DEFAULT '',
  customer_last_name TEXT DEFAULT '',
  customer_id TEXT,
  business_unit TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  transaction_id TEXT DEFAULT '',
  card_pan TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sla_deadline TIMESTAMPTZ NOT NULL,
  is_escalated BOOLEAN DEFAULT FALSE,
  escalation_count INTEGER DEFAULT 0,
  assigned_agent_id TEXT DEFAULT '',
  major_incident_id TEXT,
  feedback_score NUMERIC,
  feedback_comment TEXT,
  root_cause TEXT,
  corrective_action TEXT,
  submitted_by TEXT DEFAULT 'BU_SUPPORT',
  submitted_by_name TEXT DEFAULT '',
  submitted_by_phone TEXT DEFAULT '',
  is_deleted BOOLEAN DEFAULT FALSE,
  watchers JSONB DEFAULT '[]'::jsonb,
  rca_details JSONB
);
CREATE INDEX idx_tickets_bu ON tickets(business_unit);
CREATE INDEX idx_tickets_provider ON tickets(provider);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_created ON tickets(created_at DESC);

-- 3. COMMENTS (normalized from JSON blob)
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_internal BOOLEAN DEFAULT FALSE,
  seen BOOLEAN DEFAULT FALSE,
  parent_comment_id TEXT,
  seen_by JSONB DEFAULT '[]'::jsonb
);
CREATE INDEX idx_comments_ticket ON comments(ticket_id);

-- 4. AUDIT LOGS (append-only, immutable)
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ticket_id TEXT,
  actor TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  hash TEXT NOT NULL,
  previous_hash TEXT DEFAULT '',
  immutable BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_audit_ts ON audit_logs(timestamp DESC);

-- 5. WATCHER NOTIFICATIONS
CREATE TABLE watcher_notifications (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ticket_id TEXT NOT NULL,
  message TEXT NOT NULL,
  recipient TEXT NOT NULL,
  seen BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_notifications_recipient ON watcher_notifications(recipient);

-- 6. MAJOR INCIDENTS (normalized from JSON blob)
CREATE TABLE major_incidents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  provider TEXT DEFAULT '',
  category TEXT DEFAULT '',
  severity TEXT DEFAULT 'MEDIUM',
  active BOOLEAN DEFAULT TRUE,
  ticket_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT DEFAULT 'INVESTIGATING',
  timeline JSONB DEFAULT '[]'::jsonb,
  notifications JSONB DEFAULT '[]'::jsonb,
  pir JSONB
);

-- 7. CUSTOMERS (normalized from JSON blob)
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  business_unit TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_tickets INTEGER DEFAULT 0,
  notes TEXT
);

-- 8. SLA RULES (normalized from JSON blob)
CREATE TABLE sla_rules (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  duration_hours INTEGER NOT NULL DEFAULT 24
);

-- 9. HOLIDAYS (normalized from JSON blob)
CREATE TABLE holidays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  country TEXT DEFAULT 'NG'
);

-- 10. TICKET TEMPLATES (normalized from JSON blob)
CREATE TABLE ticket_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  priority TEXT DEFAULT 'MEDIUM',
  provider TEXT DEFAULT 'General',
  amount TEXT DEFAULT '',
  ticket_description TEXT DEFAULT ''
);

-- 11. KB ARTICLES (normalized from JSON blob)
CREATE TABLE kb_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  provider TEXT DEFAULT 'General',
  content TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  last_updated TEXT DEFAULT ''
);

-- 12. APP CONFIG (key-value store)
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- 13. EVIDENCE
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  file_type TEXT DEFAULT '',
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by TEXT DEFAULT ''
);

-- Row Level Security (RLS) — enabled on all tables
-- Service role key bypasses RLS automatically
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE watcher_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE major_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
