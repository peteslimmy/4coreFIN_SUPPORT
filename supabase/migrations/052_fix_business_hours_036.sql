-- 4CoreFinSupport — Fix business_hours SQL functions from 036
-- Migration 052: the 036 versions of get_next_business_start and
-- business_hours_elapsed were broken on Postgres at runtime:
--   * business_hours_elapsed referenced undeclared local_hours_today
--     (plpgsql error) and both functions used `current_time`, a reserved
--     keyword (syntax error when the body is parsed).
--   * Both functions named a parameter `tenant_id`, colliding with the
--     business_hours.tenant_id column (Postgres error 42702 "ambiguous").
--   * business_hours_elapsed never advanced `elapsed` in the no-config
--     branch, producing an infinite loop for tenants without settings.
-- Re-create both with corrected names and a 24/7 fallback that terminates.

-- Helper function: given a tenant_id and a local datetime, return the next local
-- business-hour start time. Returns NULL when the tenant has no business_hours
-- configuration (in which case the system falls back to 24/7 behavior).
CREATE OR REPLACE FUNCTION get_next_business_start(p_tenant TEXT, at_local TIMESTAMP) RETURNS TIMESTAMP AS $$
DECLARE
  row_record RECORD;
  dow INTEGER := EXTRACT(dow FROM at_local AT TIME ZONE (SELECT tz_name FROM business_hours WHERE tenant_id = p_tenant LIMIT 1));
  ob TIME;
  cb TIME;
  next_start TIMESTAMP;
BEGIN
  SELECT open_time_local, close_time_local INTO ob, cb
  FROM business_hours
  WHERE tenant_id = p_tenant
    AND day_of_week = dow
    AND is_active = true
  LIMIT 1;

  IF ob IS NULL THEN
    RETURN NULL; -- no biz-hours config → fallback to 24/7
  END IF;

  -- If current time is within business hours, the "next start" is now (treated as already in window)
  IF at_local::time >= ob AND at_local::time < cb THEN
    RETURN at_local;
  END IF;

  -- Otherwise, find the next open time today or tomorrow
  IF at_local::time < ob THEN
    next_start := at_local::date + ob;
  ELSE
    next_start := (at_local::date + 1) + ob;
  END IF;

  RETURN next_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: compute how many business hours elapse from a local start time,
-- given a duration in hours. Useful for SLA deadline computation.
DROP FUNCTION IF EXISTS business_hours_elapsed(timestamp without time zone, integer, text);
CREATE OR REPLACE FUNCTION business_hours_elapsed(
  start_local   TIMESTAMP,
  durationHours INTEGER,
  p_tenant      TEXT
) RETURNS TIMESTAMP AS $$
DECLARE
  current_local  TIMESTAMP := start_local;
  elapsed        INTEGER := 0;
  cur_time       TIME;
  ob             TIME;
  cb             TIME;
  dow            INTEGER;
  local_hours_today INTERVAL;
BEGIN
  WHILE elapsed < durationHours LOOP
    SELECT open_time_local, close_time_local INTO ob, cb
    FROM business_hours
    WHERE tenant_id = p_tenant
      AND day_of_week = EXTRACT(dow FROM current_local
                                AT TIME ZONE (SELECT tz_name FROM business_hours
                                              WHERE tenant_id = p_tenant
                                              LIMIT 1))
      AND is_active = true
    LIMIT 1;

    IF ob IS NULL THEN
      -- No biz-hours config → treat remaining hours as 24/7 and terminate
      current_local := current_local + INTERVAL '1 hour' * (durationHours - elapsed);
      EXIT;
    END IF;

    cur_time := current_local::time;

    IF cur_time >= ob AND cur_time < cb THEN
      local_hours_today := cb - cur_time;
      IF elapsed + (EXTRACT(epoch FROM local_hours_today) / 3600.0)::INTEGER >= durationHours - elapsed THEN
        RETURN current_local + INTERVAL '1 hour' * (durationHours - elapsed);
      END IF;
      elapsed := elapsed + (EXTRACT(epoch FROM local_hours_today) / 3600.0)::INTEGER;
      current_local := current_local::date + cb;
    ELSE
      current_local := current_local::date + cb;
      current_local := get_next_business_start(p_tenant, current_local);
      IF current_local IS NULL THEN
        -- Fallback 24/7: no config means every hour counts
        current_local := start_local + INTERVAL '1 hour' * (durationHours - elapsed);
        EXIT;
      END IF;
      CONTINUE;
    END IF;
  END LOOP;

  RETURN current_local;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;