-- 4CoreFinSupport — Data Retention Policy
-- Migration 021: Automated data cleanup for compliance

-- Data retention periods:
-- - Audit logs: 7 years (compliance requirement)
-- - Soft-deleted tickets: 2 years
-- - Comments: 7 years
-- - Evidence records: 7 years

CREATE OR REPLACE FUNCTION cleanup_expired_data() RETURNS void AS $$
BEGIN
  -- Delete audit logs older than 7 years
  DELETE FROM audit_logs 
  WHERE timestamp < NOW() - INTERVAL '7 years';
  
  -- Delete soft-deleted tickets older than 2 years
  DELETE FROM tickets 
  WHERE is_deleted = true 
    AND created_at < NOW() - INTERVAL '2 years';
  
  -- Delete comments older than 7 years
  DELETE FROM comments 
  WHERE timestamp < NOW() - INTERVAL '7 years';
  
  -- Delete evidence older than 7 years
  DELETE FROM evidence 
  WHERE uploaded_at < NOW() - INTERVAL '7 years';
  
  -- Vacuum tables to reclaim space
  VACUUM ANALYZE audit_logs;
  VACUUM ANALYZE tickets;
  VACUUM ANALYZE comments;
  VACUUM ANALYZE evidence;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION cleanup_expired_data() TO service_role;

-- Schedule cleanup to run weekly (Sunday at 2 AM)
-- Note: Requires pg_cron extension to be enabled
-- SELECT cron.schedule('cleanup-expired-data', '0 2 * * 0', 'SELECT cleanup_expired_data();');