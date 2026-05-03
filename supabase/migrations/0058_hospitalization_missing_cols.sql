-- =============================================================================
-- VetMax — Migration 0058: Colunas faltando em hospitalizations
-- Os testes esperam: admission_reason, tutor_id, discharge_at
-- A tabela existente tem: reason, consultation_id, discharged_at
-- =============================================================================

-- Adicionar tutor_id (os testes fazem upsert com esse campo)
ALTER TABLE hospitalizations
  ADD COLUMN IF NOT EXISTS tutor_id     uuid REFERENCES tutors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admission_reason text,
  ADD COLUMN IF NOT EXISTS discharge_at timestamptz;

-- Índice para FK de tutor
CREATE INDEX IF NOT EXISTS idx_hospitalizations_tutor
  ON hospitalizations(tutor_id)
  WHERE tutor_id IS NOT NULL;
