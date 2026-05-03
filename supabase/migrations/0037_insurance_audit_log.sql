-- =============================================================================
-- VetMax — Migration 0037: insurance_audit_log
-- Log de auditorias IA + colunas insurance_* em consultations
-- =============================================================================

CREATE TABLE IF NOT EXISTS insurance_audit_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid        NOT NULL REFERENCES clinics(id)             ON DELETE CASCADE,
  consultation_id     uuid        NOT NULL REFERENCES consultations(id)       ON DELETE CASCADE,
  patient_id          uuid        NOT NULL REFERENCES patients(id)            ON DELETE CASCADE,
  provider_id         uuid        NOT NULL REFERENCES insurance_providers(id) ON DELETE CASCADE,
  audit_result        text        NOT NULL
                      CHECK (audit_result IN ('approved','warnings','issues_found')),
  ai_suggestions      jsonb       NOT NULL DEFAULT '[]',
  vet_acknowledged    boolean     NOT NULL DEFAULT false,
  vet_override_reason text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_audit_log_clinic_id       ON insurance_audit_log(clinic_id);
CREATE INDEX IF NOT EXISTS idx_insurance_audit_log_consultation_id ON insurance_audit_log(consultation_id);
CREATE INDEX IF NOT EXISTS idx_insurance_audit_log_patient_id      ON insurance_audit_log(patient_id);

ALTER TABLE insurance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_insurance_audit_log" ON insurance_audit_log;
CREATE POLICY "clinic_isolation_insurance_audit_log"
  ON insurance_audit_log FOR ALL TO authenticated
  USING  (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- Colunas de convênio em consultations
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS insurance_id              uuid REFERENCES pet_insurance(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS insurance_verified_at     timestamptz,
  ADD COLUMN IF NOT EXISTS insurance_override_reason text;

CREATE INDEX IF NOT EXISTS idx_consultations_insurance_id ON consultations(insurance_id);
