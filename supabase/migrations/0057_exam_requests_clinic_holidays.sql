-- =============================================================================
-- VetMax — Migration 0057: exam_requests + clinic_holidays
-- exam_requests: tabela esperada pelos testes E2E de Exames
-- clinic_holidays: tabela esperada por TC-GOV-05 (feriados)
-- =============================================================================

-- ── exam_requests ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exam_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id      uuid        NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  tutor_id        uuid        REFERENCES tutors(id)            ON DELETE SET NULL,
  consultation_id uuid        REFERENCES consultations(id)     ON DELETE SET NULL,
  exam_type       text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','in_progress','completed','done','finished','cancelled')),
  result          text,
  notes           text,
  requested_by    uuid        REFERENCES profiles(id)          ON DELETE SET NULL,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_requests_clinic
  ON exam_requests(clinic_id);

CREATE INDEX IF NOT EXISTS idx_exam_requests_clinic_status
  ON exam_requests(clinic_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_requests_patient
  ON exam_requests(patient_id);

DROP TRIGGER IF EXISTS trg_exam_requests_updated_at ON exam_requests;
CREATE TRIGGER trg_exam_requests_updated_at
  BEFORE UPDATE ON exam_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE exam_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_exam_requests" ON exam_requests;
CREATE POLICY "clinic_isolation_exam_requests"
  ON exam_requests FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ── clinic_holidays ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinic_holidays (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid  NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  date       date  NOT NULL,
  name       text  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, date)
);

CREATE INDEX IF NOT EXISTS idx_clinic_holidays_clinic_date
  ON clinic_holidays(clinic_id, date);

ALTER TABLE clinic_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_clinic_holidays" ON clinic_holidays;
CREATE POLICY "clinic_isolation_clinic_holidays"
  ON clinic_holidays FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());
