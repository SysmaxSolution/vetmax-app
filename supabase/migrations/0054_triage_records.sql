-- =============================================================================
-- VetMax — Migration 0054: triage_records
-- Tabela dedicada de triagem esperada pelos testes E2E (triage-module.spec.ts)
-- Campos: weight_kg, temperature_celsius, anamnesis, chief_complaint, status
-- =============================================================================

CREATE TABLE IF NOT EXISTS triage_records (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id            uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id           uuid        NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  tutor_id             uuid        NOT NULL REFERENCES tutors(id)   ON DELETE RESTRICT,
  consultation_id      uuid        REFERENCES consultations(id)     ON DELETE SET NULL,
  status               text        NOT NULL DEFAULT 'waiting'
                                   CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
  chief_complaint      text,
  weight_kg            numeric(5, 2),
  temperature_celsius  numeric(4, 1),
  anamnesis            text,
  triage_notes         text,
  triaged_by           uuid        REFERENCES profiles(id)          ON DELETE SET NULL,
  triage_started_at    timestamptz,
  triage_completed_at  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_triage_records_clinic
  ON triage_records(clinic_id);

CREATE INDEX IF NOT EXISTS idx_triage_records_clinic_status
  ON triage_records(clinic_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_triage_records_patient
  ON triage_records(patient_id);

-- Foreign key index para consultation
CREATE INDEX IF NOT EXISTS idx_triage_records_consultation
  ON triage_records(consultation_id)
  WHERE consultation_id IS NOT NULL;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_triage_records_updated_at ON triage_records;
CREATE TRIGGER trg_triage_records_updated_at
  BEFORE UPDATE ON triage_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE triage_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_triage_records" ON triage_records;
CREATE POLICY "clinic_isolation_triage_records"
  ON triage_records FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());
