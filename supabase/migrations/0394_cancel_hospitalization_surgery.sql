-- =============================================================================
-- VetMax — Migration 0394: Cancelamento de Internação e Cirurgia
--
-- Adiciona o status 'cancelled' ao CHECK constraint de hospitalizations e
-- colunas de auditoria de cancelamento (motivo, quando, quem) — espelhando
-- o padrão já adotado em consultations/triage_records/exam_requests (0209).
--
-- Cirurgias já possuem 'canceled' (grafia US — mantida por compatibilidade).
-- Adicionamos apenas as colunas de auditoria em surgeries.
-- =============================================================================

BEGIN;

-- ── Internações ───────────────────────────────────────────────────────────────

-- Expande o CHECK constraint para aceitar 'cancelled'
DO $$
DECLARE v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'hospitalizations'::regclass
    AND contype = 'c'
    AND conname ILIKE '%status%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE hospitalizations DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE hospitalizations
  ADD CONSTRAINT hospitalizations_status_check CHECK (status IN (
    'observation',
    'ward',
    'icu',
    'ready_for_discharge',
    'discharged',
    'cancelled'
  ));

-- Colunas de auditoria de cancelamento
ALTER TABLE hospitalizations
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by         UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hospitalizations_cancelled
  ON hospitalizations (clinic_id, cancelled_at DESC)
  WHERE status = 'cancelled';

-- ── Cirurgias ─────────────────────────────────────────────────────────────────

-- O status 'canceled' (US) já está no CHECK de surgeries (0202).
-- Adicionamos apenas as colunas de auditoria.
ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by         UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surgeries_cancelled
  ON surgeries (clinic_id, cancelled_at DESC)
  WHERE status = 'canceled';

COMMIT;
