-- =============================================================================
-- VetMax — Migration 0209: cancelamento de atendimentos (Sprint 2026-05-30)
--
-- Adiciona colunas de auditoria de cancelamento em triage_records,
-- consultations e exam_requests. O valor 'cancelled' já é aceito nos três
-- CHECKs (migrations 0024, 0054, 0057), só faltava persistir motivo + quem +
-- quando, para o card sair da fila ativa e ir para o histórico.
--
-- A UI exige motivo obrigatório no modal antes de chamar a action — aqui
-- mantemos as colunas nullable porque registros legados pré-sprint não as
-- têm. Quem cancelar de hoje em diante, a action grava os três campos.
-- =============================================================================

BEGIN;

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by         uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE triage_records
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by         uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE exam_requests
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by         uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Índices úteis: histórico filtra por status='cancelled' ordenado por data
CREATE INDEX IF NOT EXISTS idx_consultations_cancelled
  ON consultations (clinic_id, cancelled_at DESC)
  WHERE status = 'cancelled';

CREATE INDEX IF NOT EXISTS idx_triage_records_cancelled
  ON triage_records (clinic_id, cancelled_at DESC)
  WHERE status = 'cancelled';

CREATE INDEX IF NOT EXISTS idx_exam_requests_cancelled
  ON exam_requests (clinic_id, cancelled_at DESC)
  WHERE status = 'cancelled';

COMMIT;
