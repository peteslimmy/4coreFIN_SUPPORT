-- Comments carry the author's email so replies can resolve their target
-- server-side (reply-to-sender notifications/emails) without a name lookup.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS author_email TEXT;
CREATE INDEX IF NOT EXISTS idx_comments_author_email ON comments(author_email);
