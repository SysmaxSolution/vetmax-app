-- 0401_visit_reason_acompanhamento.sql
-- M2 (Sprint Almavet) — fluxo express "Acompanhamento".
-- Adiciona 'acompanhamento' ao CHECK de consultations.visit_reason.
-- Idempotente: dropa o constraint atual (qualquer nome) e recria.

DO $$
DECLARE v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'consultations'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%visit_reason%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE consultations DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE consultations
  ADD CONSTRAINT consultations_visit_reason_check
  CHECK (visit_reason IS NULL OR visit_reason IN (
    'consultation',
    'follow_up',
    'emergency',
    'vaccination',
    'exam',
    'surgery',
    'microchipping',
    'acompanhamento'   -- Sprint Almavet (2026-06-21): fluxo express de acompanhamento
  ));
