-- =============================================
-- Supabase RPC functions for "Зарплата Земский"
-- Run these in Supabase SQL Editor
-- =============================================

-- 1. Read all data (for sync/pull)
CREATE OR REPLACE FUNCTION sync_read_all()
RETURNS JSON AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'employees', COALESCE((SELECT jsonb_agg(row_to_json(e)) FROM employees e), '[]'::jsonb),
    'daily', COALESCE((SELECT jsonb_agg(row_to_json(d)) FROM daily d), '[]'::jsonb),
    'advances', COALESCE((SELECT jsonb_agg(row_to_json(a)) FROM advances a), '[]'::jsonb),
    'schedule', COALESCE((SELECT jsonb_agg(row_to_json(s)) FROM schedule s), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Upsert daily records
CREATE OR REPLACE FUNCTION sync_write_daily(records JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO daily (date, emp_id, worked, revenue, patients)
  SELECT
    r->>'date',
    r->>'emp_id',
    (r->>'worked')::REAL,
    (r->>'revenue')::REAL,
    (r->>'patients')::INTEGER
  FROM jsonb_array_elements(records) r
  ON CONFLICT (date, emp_id) DO UPDATE SET
    worked = EXCLUDED.worked,
    revenue = EXCLUDED.revenue,
    patients = EXCLUDED.patients,
    updated_at = NOW();
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Upsert advances
CREATE OR REPLACE FUNCTION sync_write_advances(records JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO advances (month, emp_id, amount)
  SELECT
    r->>'month',
    r->>'emp_id',
    (r->>'amount')::REAL
  FROM jsonb_array_elements(records) r
  ON CONFLICT (month, emp_id) DO UPDATE SET
    amount = EXCLUDED.amount;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Upsert schedule
CREATE OR REPLACE FUNCTION sync_write_schedule(records JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO schedule (date, emp_id, start_time, end_time)
  SELECT
    r->>'date',
    r->>'emp_id',
    COALESCE(r->>'start_time', ''),
    COALESCE(r->>'end_time', '')
  FROM jsonb_array_elements(records) r
  ON CONFLICT (date, emp_id) DO UPDATE SET
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Upsert employees
CREATE OR REPLACE FUNCTION sync_write_employees(records JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO employees (emp_id, name, position, rate, is_active)
  SELECT
    r->>'emp_id',
    r->>'name',
    r->>'position',
    COALESCE((r->>'rate')::REAL, 0),
    COALESCE((r->>'is_active')::BOOLEAN, TRUE)
  FROM jsonb_array_elements(records) r
  ON CONFLICT (emp_id) DO UPDATE SET
    name = EXCLUDED.name,
    position = EXCLUDED.position,
    rate = EXCLUDED.rate,
    is_active = EXCLUDED.is_active;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Bulk write — full replace all data (clear + insert)
CREATE OR REPLACE FUNCTION sync_bulk_write(data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Replace employees
  IF data ? 'employees' AND jsonb_array_length(data->'employees') > 0 THEN
    DELETE FROM employees;
    INSERT INTO employees (emp_id, name, position, rate, is_active)
    SELECT
      r->>'emp_id',
      r->>'name',
      r->>'position',
      COALESCE((r->>'rate')::REAL, 0),
      COALESCE((r->>'is_active')::BOOLEAN, TRUE)
    FROM jsonb_array_elements(data->'employees') r;
  END IF;

  -- Replace daily
  IF data ? 'daily' AND jsonb_array_length(data->'daily') > 0 THEN
    DELETE FROM daily;
    INSERT INTO daily (date, emp_id, worked, revenue, patients)
    SELECT
      r->>'date',
      r->>'emp_id',
      (r->>'worked')::REAL,
      (r->>'revenue')::REAL,
      (r->>'patients')::INTEGER
    FROM jsonb_array_elements(data->'daily') r;
  END IF;

  -- Replace advances
  IF data ? 'advances' AND jsonb_array_length(data->'advances') > 0 THEN
    DELETE FROM advances;
    INSERT INTO advances (month, emp_id, amount)
    SELECT
      r->>'month',
      r->>'emp_id',
      (r->>'amount')::REAL
    FROM jsonb_array_elements(data->'advances') r;
  END IF;

  -- Replace schedule
  IF data ? 'schedule' AND jsonb_array_length(data->'schedule') > 0 THEN
    DELETE FROM schedule;
    INSERT INTO schedule (date, emp_id, start_time, end_time)
    SELECT
      r->>'date',
      r->>'emp_id',
      COALESCE(r->>'start_time', ''),
      COALESCE(r->>'end_time', '')
    FROM jsonb_array_elements(data->'schedule') r;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
