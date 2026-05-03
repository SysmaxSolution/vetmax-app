-- =============================================================================
-- VetMax — Migration 0032: grooming_sessions
-- Módulo Banho e Tosa — Sessões independentes do fluxo clínico
-- =============================================================================

CREATE TABLE IF NOT EXISTS grooming_sessions (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid          NOT NULL REFERENCES clinics(id)   ON DELETE CASCADE,
  patient_id        uuid          NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  tutor_id          uuid          NOT NULL REFERENCES tutors(id)    ON DELETE CASCADE,
  status            text          NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','bathing','grooming','waiting_pickup','delivered')),
  services_requested text[]       NOT NULL DEFAULT '{}',
  box_number        text,
  notes             text,
  scheduled_at      timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_by        uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

-- updated_at automático
DROP TRIGGER IF EXISTS trg_grooming_sessions_updated_at ON grooming_sessions;
CREATE TRIGGER trg_grooming_sessions_updated_at
  BEFORE UPDATE ON grooming_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_grooming_sessions_clinic_id    ON grooming_sessions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_grooming_sessions_patient_id   ON grooming_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_grooming_sessions_status       ON grooming_sessions(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_grooming_sessions_created_at   ON grooming_sessions(clinic_id, created_at DESC);

-- RLS
ALTER TABLE grooming_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_grooming_sessions" ON grooming_sessions;
CREATE POLICY "clinic_isolation_grooming_sessions"
  ON grooming_sessions FOR ALL TO authenticated
  USING  (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
