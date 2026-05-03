-- =============================================================================
-- VetMax — Migration 0043: Extend Grooming Sessions & Status Transitions
-- Módulo Banho e Tosa — 13 novos campos + WORM audit log
-- =============================================================================

BEGIN;

-- 1. Alter grooming_sessions table (add 13 new fields)
ALTER TABLE grooming_sessions
ADD COLUMN IF NOT EXISTS professional_schedule_id UUID REFERENCES professional_schedules(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS grooming_slot_id UUID REFERENCES grooming_slots(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS position_in_queue INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'scheduled'
  CHECK (current_status IN ('scheduled', 'arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup', 'paid', 'delivered', 'cancelled')),
ADD COLUMN IF NOT EXISTS check_in_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS check_out_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS term_signed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS term_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS term_version VARCHAR(50),
ADD COLUMN IF NOT EXISTS check_in_checklist JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS receipt_json JSONB DEFAULT '{}'::jsonb;

-- 2. Create grooming_status_transitions table (WORM - Write Once Read Many)
CREATE TABLE IF NOT EXISTS grooming_status_transitions (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  grooming_session_id UUID            NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  from_status         TEXT            NOT NULL,
  to_status           TEXT            NOT NULL,
  actor_id            UUID            NOT NULL REFERENCES profiles(id),
  actor_role          TEXT            NOT NULL,
  reason              TEXT,
  metadata            JSONB           DEFAULT '{}'::jsonb,
  transitioned_at     TIMESTAMPTZ     DEFAULT NOW(),

  -- WORM: no updates, no deletes
  CONSTRAINT valid_status_from CHECK (from_status IN ('scheduled', 'arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup', 'paid', 'delivered', 'cancelled')),
  CONSTRAINT valid_status_to CHECK (to_status IN ('scheduled', 'arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup', 'paid', 'delivered', 'cancelled'))
);

-- 3. Indices
CREATE INDEX idx_grooming_status_transitions_session
  ON grooming_status_transitions(clinic_id, grooming_session_id, transitioned_at DESC);

CREATE INDEX idx_grooming_status_transitions_date
  ON grooming_status_transitions(clinic_id, transitioned_at);

CREATE INDEX idx_grooming_sessions_current_status
  ON grooming_sessions(clinic_id, current_status);

CREATE INDEX idx_grooming_sessions_slot
  ON grooming_sessions(grooming_slot_id);

-- 4. RLS Policies (WORM enforcement)
ALTER TABLE grooming_status_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_can_view_own_transitions"
  ON grooming_status_transitions FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

-- INSERT only, no UPDATE/DELETE (WORM)
CREATE POLICY "clinic_can_create_transitions"
  ON grooming_status_transitions FOR INSERT
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

-- Prevent ANY UPDATE/DELETE on transitions
CREATE POLICY "no_update_transitions"
  ON grooming_status_transitions FOR UPDATE
  USING (false);

CREATE POLICY "no_delete_transitions"
  ON grooming_status_transitions FOR DELETE
  USING (false);

COMMIT;
