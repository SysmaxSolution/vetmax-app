-- 0032: Rename 'billing' → 'pharmacy', add 'hospitalization' to active_modules
-- Motivation: Sidebar module keys were aligned; 'Internação' was missing from feature flags.

-- 1. Replace 'billing' with 'pharmacy' in all active_modules arrays
UPDATE clinics
SET active_modules = (
  SELECT jsonb_agg(
    CASE
      WHEN elem::text = '"billing"' THEN '"pharmacy"'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(
    COALESCE(active_modules, '["reception","triage","consultation","exams"]'::jsonb)
  ) AS elem
)
WHERE active_modules IS NULL OR active_modules @> '["billing"]'::jsonb;

-- 2. Add 'hospitalization' to any clinic that doesn't have it yet
UPDATE clinics
SET active_modules = active_modules || '["hospitalization"]'::jsonb
WHERE NOT COALESCE(active_modules, '[]'::jsonb) @> '["hospitalization"]'::jsonb;

-- 3. Update column default
ALTER TABLE clinics
  ALTER COLUMN active_modules
  SET DEFAULT '["reception","triage","consultation","exams","pharmacy","hospitalization"]'::jsonb;
