-- 4CoreFinSupport — Fix audit chain BU filter from 034
-- Migration 051: 034 compared bu_filter directly to audit_logs.tenant_id,
-- but tenant_id is stored as 'tnt-<BU>' while bu_filter is the BU name
-- ('ALPHA'). Pre-pend 'tnt-' when the caller passes a bare BU name.

CREATE OR REPLACE FUNCTION verify_audit_chain_for_bu(bu_filter TEXT)
RETURNS TABLE (broken_index INTEGER, chain_valid BOOLEAN) AS $$
DECLARE
  logs RECORD;
  prev_hash TEXT := '';
  idx INTEGER := 0;
  broken_idx INTEGER := NULL;
  target_tenant TEXT;
BEGIN
  target_tenant := CASE
    WHEN bu_filter IS NULL OR bu_filter = ''           THEN NULL
    WHEN bu_filter LIKE 'tnt-%'                         THEN bu_filter
    ELSE 'tnt-' || bu_filter
  END;

  FOR logs IN
    SELECT id, timestamp, ticket_id, actor, role, action, details, hash, previous_hash
    FROM audit_logs
    WHERE (target_tenant IS NULL OR tenant_id = target_tenant)
    ORDER BY timestamp ASC, id ASC
  LOOP
    idx := idx + 1;
    IF idx = 1 THEN
      IF (logs.previous_hash || '') != '' THEN
        broken_idx := idx;
        EXIT;
      END IF;
    ELSE
      IF (logs.previous_hash || '') != prev_hash THEN
        broken_idx := idx;
        EXIT;
      END IF;
    END IF;
    prev_hash := logs.hash;
  END LOOP;

  IF broken_idx IS NULL THEN
    chain_valid := TRUE;
    INSERT INTO audit_verification_log (business_unit, verified_at, chain_valid, notes)
    VALUES (bu_filter, NOW(), TRUE, 'Chain verified OK');
  ELSE
    chain_valid := FALSE;
    INSERT INTO audit_verification_log (business_unit, verified_at, chain_valid, notes)
    VALUES (bu_filter, NOW(), FALSE, 'Chain broken at audit_log #' || broken_idx);
  END IF;

  RETURN QUERY SELECT broken_idx, chain_valid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;