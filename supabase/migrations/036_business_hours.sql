-- 4CoreFinSupport — Business-hours SLA
-- Migration 036: per-tenant business_hours table and SLA deadline functions.

-- business_hours table: per-tenant opening/closing times per day of week.
--tz_name is an IANA timezone name (e.g. 'America/New_York', 'UTC').
CREATE TABLE IF NOT EXISTS business_hours (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time_local TIME NOT NULL,  -- e.g. '09:00:00'
  close_time_local TIME NOT NULL, -- e.g. '17:00:00'
  tz_name TEXT NOT NULL DEFAULT 'UTC',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, day_of_week)
);

-- Index for per-tenant lookups
CREATE INDEX IF NOT EXISTS idx_business_hours_tenant ON business_hours (tenant_id);
CREATE INDEX IF NOT EXISTS idx_business_hours_dow ON business_hours (day_of_week);

-- Commentary
COMMENT ON TABLE business_hours IS 'Per-tenant business hours defining when SLA deadlines tick. Used by slaCalculator and the SLA monitor.';
COMMENT ON COLUMN business_hours.day_of_week IS '0=Sunday, 1=Monday, ..., 6=Saturday';
COMMENT ON COLUMN business_hours.open_time_local IS 'Local opening time for the tenant''s timezone';
COMMENT ON COLUMN business_hours.close_time_local IS 'Local closing time for the tenant''s timezone';

-- Helper function: given a tenant_id and a local datetime, return the next local
-- business-hour start time. Returns NULL when the tenant has no business_hours
-- configuration (in which case the system falls back to 24/7 behavior).
-- Drop-first: earlier revisions used different parameter names (p_tenant);
-- CREATE OR REPLACE cannot rename input parameters in place.
DROP FUNCTION IF EXISTS get_next_business_start(text, timestamp without time zone);
CREATE OR REPLACE FUNCTION get_next_business_start(tenant_id TEXT, at_local TIMESTAMP) RETURNS TIMESTAMP AS $$
DECLARE
  row_record RECORD;
  dow INTEGER := EXTRACT(dow FROM at_local AT TIME ZONE (SELECT tz_name FROM business_hours WHERE tenant_id = get_next_business_start.tenant_id LIMIT 1));
  ob TIME;
  cb TIME;
  next_start TIMESTAMP;
BEGIN
  SELECT open_time_local, close_time_local INTO ob, cb
  FROM business_hours
  WHERE tenant_id = get_next_business_start.tenant_id
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

-- Helper function: compute the local timestamp reached after accumulating
-- `durationHours` of business time from a local start time.
-- Drop-first: earlier revisions used different parameter names (p_tenant).
DROP FUNCTION IF EXISTS business_hours_elapsed(timestamp without time zone, integer, text);
CREATE OR REPLACE FUNCTION business_hours_elapsed(start_local TIMESTAMP, durationHours INTEGER, tenant_id TEXT) RETURNS TIMESTAMP AS $$
DECLARE
  current_local TIMESTAMP := start_local;
  remaining_hours NUMERIC := durationHours;
  ob TIME;
  cb TIME;
BEGIN
  WHILE remaining_hours > 0 LOOP
    -- Get current day's business hours for this tenant (qualify column names —
    -- unqualified "tenant_id = tenant_id" is ambiguous against the parameter).
    SELECT open_time_local, close_time_local INTO ob, cb
    FROM business_hours
    WHERE business_hours.tenant_id = business_hours_elapsed.tenant_id
      AND day_of_week = EXTRACT(dow FROM current_local AT TIME ZONE (
            SELECT tz_name FROM business_hours bh WHERE bh.tenant_id = business_hours_elapsed.tenant_id LIMIT 1))
      AND is_active = true
    LIMIT 1;

    IF ob IS NULL THEN
      -- No biz-hours config; treat as 24h days for backward compatibility
      IF remaining_hours >= 24 THEN
        current_local := current_local + INTERVAL '1 day';
        remaining_hours := remaining_hours - 24;
      ELSE
        current_local := current_local + make_interval(hours => remaining_hours);
        remaining_hours := 0;
      END IF;
      CONTINUE;
    END IF;

    -- If currently inside business hours, consume hours until close of business
    IF current_local::time >= ob AND current_local::time < cb THEN
      DECLARE
        hours_left_today NUMERIC := EXTRACT(EPOCH FROM (cb - current_local::time)) / 3600.0;
      BEGIN
        IF hours_left_today >= remaining_hours THEN
          current_local := current_local + make_interval(hours => remaining_hours);
          remaining_hours := 0;
        ELSE
          remaining_hours := remaining_hours - hours_left_today;
          current_local := date_trunc('day', current_local) + cb;
        END IF;
      END;
    ELSE
      -- Outside business hours: jump to next business start; fall back to
      -- 24/7 accumulation when the tenant has no usable next-start config.
      DECLARE
        next_start TIMESTAMP := get_next_business_start(tenant_id, current_local);
      BEGIN
        IF next_start IS NULL OR next_start <= current_local THEN
          current_local := current_local + make_interval(hours => remaining_hours);
          remaining_hours := 0;
        ELSE
          current_local := next_start;
        END IF;
      END;
    END IF;
  END LOOP;

  RETURN current_local;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;