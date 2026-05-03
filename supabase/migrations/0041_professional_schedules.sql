-- =============================================================================
-- VetMax — Migration 0041: Professional Schedules & Availability
-- Módulo Banho e Tosa — Agendas e indisponibilidades de profissionais
-- =============================================================================

BEGIN;

-- 1. Create professional_schedules table
CREATE TABLE IF NOT EXISTS professional_schedules (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id       UUID            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date                  DATE            NOT NULL,
  start_time            TIME            NOT NULL,
  end_time              TIME            NOT NULL,
  available             BOOLEAN         DEFAULT true,
  capacity              INTEGER         DEFAULT 3 CHECK (capacity > 0 AND capacity <= 10),
  service_type          TEXT            DEFAULT 'banho_tosa'
    CHECK (service_type IN ('banho', 'tosa', 'banho_tosa')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ     DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     DEFAULT NOW(),

  -- Constraints
  CONSTRAINT check_time_order CHECK (start_time < end_time),
  CONSTRAINT check_duration CHECK (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 >= 1),
  UNIQUE(clinic_id, professional_id, date, start_time, end_time)
);

-- 2. Create professional_unavailability table (WORM pattern for audit)
CREATE TABLE IF NOT EXISTS professional_unavailability (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id       UUID            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date            DATE            NOT NULL,
  end_date              DATE            NOT NULL,
  reason                TEXT            DEFAULT 'vacation'
    CHECK (reason IN ('vacation', 'sick_leave', 'training', 'emergency', 'other')),
  notes                 TEXT,
  created_by            UUID            REFERENCES profiles(id),
  created_at            TIMESTAMPTZ     DEFAULT NOW(),

  CONSTRAINT check_date_order CHECK (start_date <= end_date)
);

-- 3. Trigger for updated_at on professional_schedules
CREATE TRIGGER trg_professional_schedules_updated_at
  BEFORE UPDATE ON professional_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Indices for performance
CREATE INDEX idx_professional_schedules_clinic_date
  ON professional_schedules(clinic_id, date);

CREATE INDEX idx_professional_schedules_professional_date
  ON professional_schedules(professional_id, date);

CREATE INDEX idx_professional_schedules_availability
  ON professional_schedules(clinic_id, available, date)
  WHERE available = true;

CREATE INDEX idx_professional_unavailability_professional_date
  ON professional_unavailability(professional_id, start_date, end_date);

-- 5. RLS Policies
ALTER TABLE professional_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_unavailability ENABLE ROW LEVEL SECURITY;

-- professional_schedules: clinic isolation + role-based access
CREATE POLICY "clinic_can_view_own_schedules"
  ON professional_schedules FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "clinic_receptionist_can_manage_schedules"
  ON professional_schedules FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('receptionist', 'admin')
  );

CREATE POLICY "professional_can_view_own_schedule"
  ON professional_schedules FOR SELECT
  USING (
    professional_id = auth.uid()
    OR clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- professional_unavailability: professional privacy + admin access
CREATE POLICY "professional_can_view_own_unavailability"
  ON professional_unavailability FOR SELECT
  USING (
    professional_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin')
  );

CREATE POLICY "admin_can_manage_unavailability"
  ON professional_unavailability FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin')
  );

COMMIT;
