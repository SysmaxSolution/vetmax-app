-- Migration 0097: Log de remoção de pet de módulos ativos (G-05)
-- Auditável: preserva histórico, registra quem removeu e por quê.

CREATE TABLE IF NOT EXISTS module_removal_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  removed_by      uuid        NOT NULL REFERENCES profiles(id),
  patient_id      uuid        NOT NULL,
  patient_name    text        NOT NULL,
  module          text        NOT NULL,  -- 'triage' | 'vet' | 'exams' | 'hospitalization' | 'grooming'
  reference_id    uuid        NOT NULL,  -- consultation_id ou hospitalization_id
  reason          text        NOT NULL,
  removed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_module_removal_clinic
  ON module_removal_logs(clinic_id, removed_at DESC);

ALTER TABLE module_removal_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_module_removal" ON module_removal_logs;
CREATE POLICY "clinic_isolation_module_removal"
  ON module_removal_logs FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());
