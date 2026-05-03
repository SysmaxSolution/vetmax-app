-- =============================================================================
-- VetMax — Migration 0046: Core Management Tables
-- clinic_settings, product_prices, central_cashier
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Extend clinic_settings with business_hours, working_days, holiday_work
-- =========================================================================

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS business_hours    JSONB DEFAULT '{"monday":{"open":"08:00","close":"18:00"},"tuesday":{"open":"08:00","close":"18:00"},"wednesday":{"open":"08:00","close":"18:00"},"thursday":{"open":"08:00","close":"18:00"},"friday":{"open":"08:00","close":"18:00"},"saturday":{"open":"08:00","close":"12:00"},"sunday":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS working_days     int[] DEFAULT '{1,2,3,4,5,6}',
  ADD COLUMN IF NOT EXISTS holiday_work     BOOLEAN DEFAULT false;

COMMENT ON COLUMN clinics.business_hours IS 'JSON: {day_name: {open: HH:MM, close: HH:MM}}';
COMMENT ON COLUMN clinics.working_days IS 'Array of ISO weekdays (1=Mon, 7=Sun)';
COMMENT ON COLUMN clinics.holiday_work IS 'Allow scheduling on holidays';

-- Index for clinic queries
CREATE INDEX IF NOT EXISTS idx_clinics_active
  ON clinics (id);

-- =========================================================================
-- 2. Product Prices Table (multi-tenant: clinic_id)
-- =========================================================================

CREATE TABLE IF NOT EXISTS product_prices (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name            TEXT         NOT NULL,
  category        TEXT         NOT NULL,
  price           NUMERIC(10, 2) NOT NULL CONSTRAINT price_positive CHECK (price >= 0),
  is_active       BOOLEAN      DEFAULT true,
  created_at      TIMESTAMPTZ  DEFAULT now(),
  updated_at      TIMESTAMPTZ  DEFAULT now(),
  created_by      UUID         REFERENCES profiles(id),

  CONSTRAINT product_prices_unique_per_clinic UNIQUE (clinic_id, name, category)
);

COMMENT ON TABLE product_prices IS 'Pricing catalog per clinic (grooming_supplies, medications, exams, etc)';
COMMENT ON COLUMN product_prices.category IS 'grooming_supplies|medications|exams|services|other';

CREATE INDEX IF NOT EXISTS idx_product_prices_clinic_category
  ON product_prices (clinic_id, category)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_product_prices_clinic
  ON product_prices (clinic_id)
  WHERE is_active = true;

-- =========================================================================
-- 3. Central Cashier Table (accounting ledger per clinic)
-- =========================================================================

CREATE TABLE IF NOT EXISTS central_cashier (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  source_module   TEXT         NOT NULL,
  source_id       UUID         DEFAULT NULL,
  amount          NUMERIC(12, 2) NOT NULL CONSTRAINT amount_not_zero CHECK (amount != 0),
  status          TEXT         NOT NULL DEFAULT 'recorded',
  reason          TEXT         DEFAULT NULL,
  created_at      TIMESTAMPTZ  DEFAULT now(),
  recorded_by     UUID         REFERENCES profiles(id),

  CONSTRAINT central_cashier_status_check CHECK (status IN ('recorded', 'verified', 'archived'))
);

COMMENT ON TABLE central_cashier IS 'Central accounting ledger: grooming, pharmacy, consultations, exams';
COMMENT ON COLUMN central_cashier.source_module IS 'grooming|pharmacy|consultation|exam|manual|adjustment';
COMMENT ON COLUMN central_cashier.source_id IS 'FK to grooming_sessions.id | pharmacy_sales.id, etc';
COMMENT ON COLUMN central_cashier.status IS 'recorded (default) | verified (by accountant) | archived';

CREATE INDEX IF NOT EXISTS idx_central_cashier_clinic_date
  ON central_cashier (clinic_id, created_at DESC)
  WHERE status != 'archived';

CREATE INDEX IF NOT EXISTS idx_central_cashier_module
  ON central_cashier (clinic_id, source_module);

CREATE INDEX IF NOT EXISTS idx_central_cashier_status
  ON central_cashier (clinic_id, status)
  WHERE status IN ('recorded', 'verified');

-- =========================================================================
-- 4. RLS Policies: product_prices
-- =========================================================================

ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_prices_select_clinic"
  ON product_prices FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "product_prices_insert_clinic_admin"
  ON product_prices FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner')
  );

CREATE POLICY "product_prices_update_clinic_admin"
  ON product_prices FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner')
  );

CREATE POLICY "product_prices_delete_clinic_admin"
  ON product_prices FOR DELETE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner')
  );

-- =========================================================================
-- 5. RLS Policies: central_cashier
-- =========================================================================

ALTER TABLE central_cashier ENABLE ROW LEVEL SECURITY;

CREATE POLICY "central_cashier_select_clinic"
  ON central_cashier FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner', 'accountant')
  );

CREATE POLICY "central_cashier_insert_clinic"
  ON central_cashier FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "central_cashier_update_verified_admin"
  ON central_cashier FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner', 'accountant')
  );

-- =========================================================================
-- 6. Triggers: Validate business_hours JSON format
-- =========================================================================

CREATE OR REPLACE FUNCTION validate_clinic_business_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.business_hours IS NOT NULL THEN
    -- Ensure all required day keys have proper structure
    IF NOT (
      NEW.business_hours ? 'monday' AND
      NEW.business_hours ? 'sunday'
    ) THEN
      RAISE EXCEPTION 'business_hours must contain all weekdays (monday-sunday)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_validate_business_hours
BEFORE INSERT OR UPDATE ON clinics
FOR EACH ROW
EXECUTE FUNCTION validate_clinic_business_hours();

-- =========================================================================
-- 7. Audit trigger for central_cashier changes
-- =========================================================================

CREATE OR REPLACE FUNCTION audit_central_cashier()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    clinic_id, table_name, record_id, action, old_value, new_value, actor_id, created_at
  ) VALUES (
    NEW.clinic_id,
    'central_cashier',
    NEW.id::text,
    TG_OP,
    to_jsonb(OLD),
    to_jsonb(NEW),
    auth.uid(),
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_central_cashier
AFTER INSERT OR UPDATE ON central_cashier
FOR EACH ROW
EXECUTE FUNCTION audit_central_cashier();

COMMIT;
