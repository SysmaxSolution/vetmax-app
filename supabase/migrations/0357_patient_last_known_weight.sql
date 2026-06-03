-- 0357 — Peso conhecido do pet + evento weight_update no histórico
--
-- 1. Adiciona patients.last_known_weight (kg) + when + source
-- 2. Estende patient_petlove_history.event_type para aceitar 'weight_update'
--    (a tabela já é genérica de auditoria do pet — apesar do nome, é usada
--    por features além de Petlove)
--
-- Sprint 2026-06-03 — campo peso unificado.

BEGIN;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS last_known_weight        NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS last_known_weight_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_known_weight_source TEXT
    CHECK (last_known_weight_source IS NULL OR last_known_weight_source IN
      ('manual', 'reception', 'triage', 'vet', 'hospitalization'));

ALTER TABLE patient_petlove_history
  DROP CONSTRAINT IF EXISTS patient_petlove_history_event_type_check;

ALTER TABLE patient_petlove_history
  ADD CONSTRAINT patient_petlove_history_event_type_check
  CHECK (event_type IN (
    'patient_created',
    'plan_updated',
    'price_updated',
    'entry_created',
    'weight_update'
  ));

-- Backfill: popula patients.last_known_weight com o último valor conhecido
-- em consultations.weight (mais recente). Best-effort — silencia erros.
DO $$
BEGIN
  UPDATE patients p
  SET
    last_known_weight        = c.weight,
    last_known_weight_at     = c.created_at,
    last_known_weight_source = 'triage'
  FROM (
    SELECT DISTINCT ON (patient_id)
      patient_id, weight, created_at
    FROM consultations
    WHERE weight IS NOT NULL AND weight > 0
    ORDER BY patient_id, created_at DESC
  ) c
  WHERE c.patient_id = p.id
    AND p.last_known_weight IS NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[0357] Backfill saltado: %', SQLERRM;
END $$;

COMMIT;
