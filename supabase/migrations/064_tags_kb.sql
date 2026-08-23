-- 4CoreFinSupport — Tag management + KB enhancements
-- Migration 064: Tag taxonomy, ticket tagging, KB versioning

CREATE SCHEMA IF NOT EXISTS tags;

CREATE TABLE IF NOT EXISTS tags.tag_taxonomy (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  description     TEXT DEFAULT '',
  color           TEXT DEFAULT '#6366f1',
  parent_id       UUID REFERENCES tags.tag_taxonomy(id),
  active          BOOLEAN NOT NULL DEFAULT true,
  tenant_id       TEXT NOT NULL DEFAULT 'tnt-ALPHA',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tags.tag_taxonomy (name, description, color) VALUES
  ('payment-issue', 'Payment processing issues', '#ef4444'),
  ('account', 'Account related', '#3b82f6'),
  ('integration', 'Integration/API issues', '#8b5cf6'),
  ('data', 'Data issues', '#f59e0b'),
  ('security', 'Security concerns', '#dc2626'),
  ('enhancement', 'Feature requests', '#10b981'),
  ('onboarding', 'New partner onboarding', '#06b6d4'),
  ('compliance', 'Compliance/regulatory', '#6366f1')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS tags.ticket_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL,
  tag_id          UUID NOT NULL REFERENCES tags.tag_taxonomy(id) ON DELETE CASCADE,
  tagged_by       TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticket_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_tags_ticket ON tags.ticket_tags (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_tag ON tags.ticket_tags (tag_id);

CREATE SCHEMA IF NOT EXISTS kb;

CREATE TABLE IF NOT EXISTS kb.kb_article_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL,
  version         INTEGER NOT NULL,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT '',
  content         TEXT NOT NULL DEFAULT '',
  tags            JSONB DEFAULT '[]',
  change_notes    TEXT DEFAULT '',
  edited_by       TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (article_id, version)
);

CREATE INDEX IF NOT EXISTS idx_kb_versions_article ON kb.kb_article_versions (article_id);

CREATE TABLE IF NOT EXISTS kb.kb_article_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL,
  user_id         TEXT NOT NULL,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_feedback_article ON kb.kb_article_feedback (article_id);

CREATE TABLE IF NOT EXISTS kb.kb_article_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL,
  user_id         TEXT NOT NULL DEFAULT '',
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_views_article ON kb.kb_article_views (article_id);
CREATE INDEX IF NOT EXISTS idx_kb_views_viewed ON kb.kb_article_views (viewed_at DESC);
