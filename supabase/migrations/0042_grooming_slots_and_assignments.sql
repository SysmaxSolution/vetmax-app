-- =============================================================================
-- VetMax — Migration 0042: Grooming Slots & Assignments
-- Módulo Banho e Tosa — Agregação de slots e fila FIFO com SELECT FOR UPDATE
-- =============================================================================

BEGIN;

-- 1. Create grooming_slots table
CREATE TABLE IF NOT EXISTS grooming_slots (
  id                        UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                 UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_schedule_id  UUID            NOT NULL REFERENCES professional_schedules(id) ON DELETE CASCADE,
  date                      DATE            NOT NULL,
  start_time                TIME            NOT NULL,
  end_time                  TIME            NOT NULL,
  capacity                  INTEGER         DEFAULT 3 CHECK (capacity > 0),
  booked_count              INTEGER         DEFAULT 0 CHECK (booked_count >= 0),
  status                    TEXT            DEFAULT 'available'
    CHECK (status IN ('available', 'full', 'cancelled')),
  created_at                TIMESTAMPTZ     DEFAULT NOW(),
  updated_at                TIMESTAMPTZ     DEFAULT NOW(),

  CONSTRAINT check_booked_le_capacity CHECK (booked_count <= capacity),
  UNIQUE(professional_schedule_id, date, start_time)
);

-- 2. Create grooming_slot_assignments table (FIFO queue)
CREATE TABLE IF NOT EXISTS grooming_slot_assignments (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  grooming_session_id   UUID            NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  grooming_slot_id      UUID            NOT NULL REFERENCES grooming_slots(id) ON DELETE CASCADE,
  professional_id       UUID            NOT NULL REFERENCES profiles(id),
  position_in_queue     INTEGER         NOT NULL DEFAULT 1,
  assigned_at           TIMESTAMPTZ     DEFAULT NOW(),
  created_at            TIMESTAMPTZ     DEFAULT NOW(),

  UNIQUE(grooming_slot_id, grooming_session_id),
  CONSTRAINT check_position CHECK (position_in_queue > 0)
);

-- 3. Trigger for updated_at on grooming_slots
CREATE TRIGGER trg_grooming_slots_updated_at
  BEFORE UPDATE ON grooming_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Auto-update status when booked_count reaches capacity
CREATE OR REPLACE FUNCTION fn_grooming_slots_status_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booked_count >= NEW.capacity AND OLD.status = 'available' THEN
    NEW.status := 'full';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_grooming_slots_status_update
  BEFORE UPDATE ON grooming_slots
  FOR EACH ROW EXECUTE FUNCTION fn_grooming_slots_status_update();

-- 5. Indices
CREATE INDEX idx_grooming_slots_clinic_date
  ON grooming_slots(clinic_id, date, start_time);

CREATE INDEX idx_grooming_slots_availability
  ON grooming_slots(professional_schedule_id, status)
  WHERE status = 'available';

CREATE INDEX idx_grooming_slot_assignments_professional
  ON grooming_slot_assignments(professional_id, clinic_id);

CREATE INDEX idx_grooming_slot_assignments_queue
  ON grooming_slot_assignments(grooming_slot_id, position_in_queue);

-- 6. RLS Policies
ALTER TABLE grooming_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE grooming_slot_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_can_view_own_slots"
  ON grooming_slots FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "clinic_can_manage_slots"
  ON grooming_slots FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('receptionist', 'admin')
  );

CREATE POLICY "professional_can_view_own_assignments"
  ON grooming_slot_assignments FOR SELECT
  USING (
    professional_id = auth.uid()
    OR clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

COMMIT;
