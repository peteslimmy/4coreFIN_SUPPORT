-- 4CoreFinSupport — Survey / CSAT Campaign Engine
-- Migration 069: surveys schema, campaign + response tables, stats view, seed

CREATE SCHEMA IF NOT EXISTS surveys;

CREATE TABLE IF NOT EXISTS surveys.survey_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  type          TEXT NOT NULL DEFAULT 'CSAT',
  question      TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  trigger_type  TEXT NOT NULL DEFAULT 'ticket_resolved',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    TEXT DEFAULT '',
  tenant_id     TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS surveys.survey_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES surveys.survey_campaigns(id) ON DELETE CASCADE,
  ticket_id       TEXT NOT NULL,
  responder_email TEXT NOT NULL,
  rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment         TEXT DEFAULT '',
  responded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id       TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_campaign ON surveys.survey_responses (campaign_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_ticket ON surveys.survey_responses (ticket_id);

CREATE OR REPLACE VIEW surveys.campaign_stats AS
SELECT
  c.id            AS campaign_id,
  c.name          AS campaign_name,
  c.type          AS campaign_type,
  c.is_active,
  COALESCE(AVG(r.rating), 0)::NUMERIC(3,2)  AS avg_rating,
  COUNT(r.id)::INTEGER                      AS response_count,
  COUNT(r.id) FILTER (WHERE r.rating = 1)::INTEGER AS rating_1_count,
  COUNT(r.id) FILTER (WHERE r.rating = 2)::INTEGER AS rating_2_count,
  COUNT(r.id) FILTER (WHERE r.rating = 3)::INTEGER AS rating_3_count,
  COUNT(r.id) FILTER (WHERE r.rating = 4)::INTEGER AS rating_4_count,
  COUNT(r.id) FILTER (WHERE r.rating = 5)::INTEGER AS rating_5_count
FROM surveys.survey_campaigns c
LEFT JOIN surveys.survey_responses r ON r.campaign_id = c.id
GROUP BY c.id, c.name, c.type, c.is_active;

-- Seed default CSAT campaign
INSERT INTO surveys.survey_campaigns (name, description, type, question, trigger_type, created_by)
VALUES (
  'Post-Resolution CSAT',
  'Automatically sent when a ticket is resolved or closed',
  'CSAT',
  'How satisfied are you with the resolution of your support ticket?',
  'ticket_resolved',
  'system'
)
ON CONFLICT DO NOTHING;
