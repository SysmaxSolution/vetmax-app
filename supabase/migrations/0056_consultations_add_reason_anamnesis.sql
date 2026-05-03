-- =============================================================================
-- VetMax — Migration 0056: Adicionar colunas reason e anamnesis em consultations
-- Os testes TC-VET-*, TC-PAC-03 e TC-RLS-06 inserem/selecionam estas colunas.
-- =============================================================================

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS reason   text,
  ADD COLUMN IF NOT EXISTS anamnesis text,
  ADD COLUMN IF NOT EXISTS tutor_id  uuid REFERENCES tutors(id) ON DELETE SET NULL;

-- Índice para FK de tutor (evita seq scan no join)
CREATE INDEX IF NOT EXISTS idx_consultations_tutor
  ON consultations(tutor_id)
  WHERE tutor_id IS NOT NULL;

-- Índice composto para buscas comuns no módulo vet
CREATE INDEX IF NOT EXISTS idx_consultations_clinic_status_date
  ON consultations(clinic_id, status, created_at DESC);
