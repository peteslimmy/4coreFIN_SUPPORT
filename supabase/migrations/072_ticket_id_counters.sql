-- Atomic per-BU/per-day ticket ID sequencing.
--
-- Replaces the read-all-tickets-then-compute-max approach that raced under
-- concurrent submissions: two requests could observe the same max sequence and
-- generate identical IDs, silently overwriting one ticket via upsert.
--
-- next_ticket_id_sequence() atomically increments and returns the next
-- sequence for a (bu_code, date_key) pair in a single statement.

CREATE TABLE IF NOT EXISTS ticket_id_counters (
  bu_code TEXT NOT NULL,
  date_key TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bu_code, date_key)
);

CREATE OR REPLACE FUNCTION next_ticket_id_sequence(p_bu_code TEXT, p_date_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO ticket_id_counters (bu_code, date_key, seq)
  VALUES (p_bu_code, p_date_key, 1)
  ON CONFLICT (bu_code, date_key)
  DO UPDATE SET seq = ticket_id_counters.seq + 1
  RETURNING seq INTO v_seq;
  RETURN v_seq;
END;
$$ LANGUAGE plpgsql;
