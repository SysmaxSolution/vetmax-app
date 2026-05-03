-- =============================================================================
-- VetMax — Migration 0035: pet_insurance
-- Vínculo patient ↔ convênio (member_id, plan_type, coverage_status)
-- =============================================================================

CREATE TABLE IF NOT EXISTS pet_insurance (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES clinics(id)               ON DELETE CASCADE,
  patient_id      uuid        NOT NULL REFERENCES patients(id)              ON DELETE CASCADE,
  tutor_id        uuid                 REFERENCES tutors(id)                ON DELETE SET NULL,
  provider_id     uuid        NOT NULL REFERENCES insurance_providers(id)   ON DELETE RESTRICT,
  plan_type       text        NOT NULL,
  member_id       text        NOT NULL,
  coverage_status text        NOT NULL DEFAULT 'active'
                              CHECK (coverage_status IN ('active','suspended','cancelled')),
  valid_until     date,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_insurance_patient_unique ON pet_insurance(patient_id);
CREATE INDEX IF NOT EXISTS idx_pet_insurance_clinic_id   ON pet_insurance(clinic_id);
CREATE INDEX IF NOT EXISTS idx_pet_insurance_provider_id ON pet_insurance(provider_id);

ALTER TABLE pet_insurance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_pet_insurance" ON pet_insurance;
CREATE POLICY "clinic_isolation_pet_insurance"
  ON pet_insurance FOR ALL TO authenticated
  USING  (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
