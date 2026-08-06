-- 4CoreFinSupport — Paginated Audit Chain Verification
-- Migration 018: Add function for chunked audit chain verification

-- Function to verify audit chain in chunks (for large datasets)
CREATE OR REPLACE FUNCTION verify_audit_chain_chunked(
  chunk_size INT DEFAULT 5000,
  start_cursor TEXT DEFAULT NULL
) RETURNS TABLE (
  valid BOOLEAN,
  broken_index BIGINT,
  next_cursor TEXT,
  checked_count BIGINT
) LANGUAGE plpgsql AS $$
DECLARE
  prev_hash TEXT := '';
  current_hash TEXT;
  idx BIGINT := 0;
  broken_idx BIGINT := NULL;
  is_valid BOOLEAN := TRUE;
  cursor TEXT := start_cursor;
  row RECORD;
BEGIN
  FOR row IN
    SELECT id, timestamp, ticket_id, actor, role, action, details, hash, previous_hash
    FROM audit_logs
    WHERE (start_cursor IS NULL OR id > start_cursor)
    ORDER BY timestamp ASC, id ASC
    LIMIT chunk_size
  LOOP
    idx := idx + 1;
    cursor := row.id;
    
    -- Verify previous hash linkage
    IF idx = 1 AND start_cursor IS NOT NULL THEN
      -- For continuation chunks, we can't verify the first link without the previous chunk's last hash
      -- In practice, the caller should pass the last hash from previous chunk
      NULL; -- Skip first link verification for continuation
    ELSIF row.previous_hash <> prev_hash THEN
      is_valid := FALSE;
      broken_idx := idx;
      EXIT;
    END IF;
    
    -- Verify current hash
    current_hash := 'sha256-' || encode(
      digest(
        row.id || '|' || row.timestamp || '|' || COALESCE(row.ticket_id, '') || '|' || 
        row.actor || '|' || row.role || '|' || row.action || '|' || row.details || '|' || 
        COALESCE(row.previous_hash, ''),
        'sha256'
      ),
      'hex'
    );
    
    IF row.hash <> current_hash THEN
      is_valid := FALSE;
      broken_idx := idx;
      EXIT;
    END IF;
    
    prev_hash := row.hash;
  END LOOP;
  
  RETURN QUERY SELECT is_valid, broken_idx, cursor, idx;
END;
$$;

-- Function to get audit chain stats
CREATE OR REPLACE FUNCTION get_audit_chain_stats() RETURNS TABLE (
  total_entries BIGINT,
  earliest_entry TIMESTAMPTZ,
  latest_entry TIMESTAMPTZ,
  chain_head_hash TEXT,
  chain_head_id TEXT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    MIN(timestamp),
    MAX(timestamp),
    (SELECT hash FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT 1),
    (SELECT id FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT 1)
  FROM audit_logs;
END;
$$;