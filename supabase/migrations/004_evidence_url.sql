-- 14. EVIDENCE: add storage URL column
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS url TEXT DEFAULT '';

-- Storage bucket for ticket evidence is created programmatically by the server
-- on boot (see server/routes.ts / ensureEvidenceBucket).
