-- 4CoreFinSupport — Atomic reference-table replace
-- Migration 045: replace_table_rows() swaps the full contents of a
-- reference-data table in ONE transaction (DELETE + INSERT), so a failure
-- mid-replace can never leave the table empty. The JS client cannot open
-- transactions; this RPC is the only atomic path.
--
-- Rows arrive as snake_case JSON matching the table columns;
-- jsonb_populate_recordset maps keys onto the row type and ignores
-- unknown keys.

CREATE OR REPLACE FUNCTION replace_table_rows(p_table TEXT, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allowed TEXT[] := ARRAY['sla_rules', 'holidays', 'ticket_templates', 'kb_articles'];
  v_inserted INTEGER;
BEGIN
  IF NOT (p_table = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'replace_table_rows: table % is not replaceable', p_table;
  END IF;
  IF NOT jsonb_typeof(p_rows) = 'array' THEN
    RAISE EXCEPTION 'replace_table_rows: p_rows must be a JSON array';
  END IF;

  EXECUTE format('DELETE FROM %I', p_table);

  EXECUTE format(
    'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I, $1)',
    p_table, p_table
  ) USING p_rows;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION replace_table_rows(TEXT, JSONB) IS
  'Atomically replace the full contents of a whitelisted reference table (sla_rules, holidays, ticket_templates, kb_articles). Rows arrive as snake_case JSON matching the table columns.';
