-- 4CoreFinSupport — Notification engine domain
-- Migration 062: Per-user preferences, templates, delivery tracking

CREATE SCHEMA IF NOT EXISTS notify;

CREATE TABLE IF NOT EXISTS notify.preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL UNIQUE,
  email_enabled   BOOLEAN NOT NULL DEFAULT true,
  push_enabled    BOOLEAN NOT NULL DEFAULT true,
  sms_enabled     BOOLEAN NOT NULL DEFAULT false,
  slack_enabled   BOOLEAN NOT NULL DEFAULT false,
  teams_enabled   BOOLEAN NOT NULL DEFAULT false,
  quiet_hours     JSONB DEFAULT '{"enabled": false, "start": "22:00", "end": "07:00"}',
  categories      JSONB DEFAULT '{"sla": true, "assignment": true, "comment": true, "status_change": true, "major_incident": true}',
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notify.templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('email', 'push', 'sms', 'slack', 'teams')),
  subject         TEXT DEFAULT '',
  body_html       TEXT DEFAULT '',
  body_text       TEXT DEFAULT '',
  variables       JSONB DEFAULT '[]',
  active          BOOLEAN NOT NULL DEFAULT true,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO notify.templates (code, name, channel, subject, body_html, variables) VALUES
  ('TICKET_ASSIGNED', 'Ticket Assigned', 'email', 'Ticket {{ticketId}} has been assigned to you', '<p>Hello {{assigneeName}},</p><p>Ticket <strong>{{ticketId}}</strong> ({{category}}) has been assigned to you.</p><p>Priority: {{priority}}</p>', '["ticketId","assigneeName","category","priority"]'),
  ('TICKET_RESOLVED', 'Ticket Resolved', 'email', 'Ticket {{ticketId}} has been resolved', '<p>Ticket <strong>{{ticketId}}</strong> has been resolved.</p><p>Resolution: {{resolution}}</p>', '["ticketId","resolution"]'),
  ('SLA_BREACH', 'SLA Breach', 'email', 'SLA BREACH: Ticket {{ticketId}}', '<p>SLA has been breached for ticket <strong>{{ticketId}}</strong>.</p><p>Deadline was: {{deadline}}</p>', '["ticketId","deadline"]'),
  ('SLA_AT_RISK', 'SLA At Risk', 'email', 'SLA Warning: Ticket {{ticketId}}', '<p>SLA is at risk for ticket <strong>{{ticketId}}</strong>.</p><p>Deadline: {{deadline}}</p>', '["ticketId","deadline"]'),
  ('COMMENT_MENTION', 'Comment Mention', 'email', 'You were mentioned in Ticket {{ticketId}}', '<p>{{actorName}} mentioned you in a comment on ticket <strong>{{ticketId}}</strong>.</p><p>Comment: {{commentPreview}}</p>', '["actorName","ticketId","commentPreview"]'),
  ('MAJOR_INCIDENT', 'Major Incident Declared', 'email', 'Major Incident {{incidentId}} declared', '<p>A major incident has been declared: <strong>{{title}}</strong></p><p>Impact: {{impact}}</p>', '["incidentId","title","impact"]')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS notify.delivery_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code   TEXT NOT NULL,
  channel         TEXT NOT NULL,
  recipient       TEXT NOT NULL,
  subject         TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  error           TEXT,
  metadata        JSONB DEFAULT '{}',
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_log_recipient ON notify.delivery_log (recipient);
CREATE INDEX IF NOT EXISTS idx_delivery_log_status ON notify.delivery_log (status);
CREATE INDEX IF NOT EXISTS idx_delivery_log_template ON notify.delivery_log (template_code);
CREATE INDEX IF NOT EXISTS idx_delivery_log_created ON notify.delivery_log (created_at DESC);
