-- Migration 0090: soft delete de pacientes com motivo obrigatório (G-05)
-- Permite arquivar um pet sem perder histórico clínico (auditoria CFMV)

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text        DEFAULT NULL;

-- Índice para filtrar pets não deletados nas queries operacionais
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at
  ON patients (clinic_id, deleted_at)
  WHERE deleted_at IS NULL;
