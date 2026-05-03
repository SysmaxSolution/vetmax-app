-- Adiciona 'hospitalized' ao CHECK de consultations.status
-- Busca o nome real do constraint dinamicamente para evitar falha no DROP

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'consultations'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%in_progress%'  -- identifica o constraint de status
    AND pg_get_constraintdef(oid) NOT LIKE '%payment%'; -- exclui payment_status

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE consultations DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE consultations
  ADD CONSTRAINT consultations_status_check CHECK (status IN (
    'scheduled_future',
    'reception',
    'scheduled',
    'triage',
    'in_progress',
    'waiting_exam',
    'medication',
    'completed',
    'cancelled',
    'hospitalized'
  ));
