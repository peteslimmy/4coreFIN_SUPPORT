-- 4CoreFinSupport — Ticket status transition guard
-- Migration 046: Database-level enforcement of the ticket lifecycle adjacency
-- list (mirrors src/lib/ticketStateMachine.ts). The API enforces role gating
-- and required fields; this trigger is the last line of defense so no writer
-- (script, console, future bug) can put a ticket into an impossible state.

CREATE OR REPLACE FUNCTION check_ticket_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Creation may start a ticket in any non-terminal active state; the API
    -- itself only ever creates RECEIPT rows, but bulk import paths differ.
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_allowed := ARRAY[
      'RECEIPT>ASSIGNED', 'RECEIPT>CLOSED',
      'ASSIGNED>INVESTIGATE', 'ASSIGNED>CLOSED',
      'INVESTIGATE>WAITING_CUSTOMER', 'INVESTIGATE>WAITING_PARTNER',
      'INVESTIGATE>WAITING_INTERNAL', 'INVESTIGATE>RESOLVED', 'INVESTIGATE>CLOSED',
      'WAITING_CUSTOMER>INVESTIGATE', 'WAITING_CUSTOMER>CLOSED',
      'WAITING_PARTNER>INVESTIGATE', 'WAITING_PARTNER>CLOSED',
      'WAITING_INTERNAL>INVESTIGATE', 'WAITING_INTERNAL>CLOSED',
      'RESOLVED>CLOSED', 'RESOLVED>INVESTIGATE',
      'CLOSED>INVESTIGATE', 'CLOSED>CLOSED'
    ];
    IF NOT (OLD.status || '>' || NEW.status = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Illegal ticket status transition % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_status_transition_guard ON tickets;
CREATE TRIGGER tickets_status_transition_guard
  BEFORE INSERT OR UPDATE OF status ON tickets
  FOR EACH ROW EXECUTE FUNCTION check_ticket_status_transition();

COMMENT ON FUNCTION check_ticket_status_transition() IS
  'Enforces the ticket lifecycle adjacency list (see src/lib/ticketStateMachine.ts TRANSITIONS). INSERTs are unconstrained; UPDATEs may only move along allowed edges.';
