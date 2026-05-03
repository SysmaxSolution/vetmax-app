-- =============================================================================
-- VetMax — Migration 0059: Tabela prescriptions
-- Vincula prescrições de medicamentos a uma consulta
-- =============================================================================

CREATE TABLE IF NOT EXISTS prescriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  medication      text NOT NULL,
  dose            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_consultation ON prescriptions(consultation_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_clinic      ON prescriptions(clinic_id);

-- RLS
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation_prescriptions" ON prescriptions
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
