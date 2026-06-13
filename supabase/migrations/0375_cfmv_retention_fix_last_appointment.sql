-- CFMV Res. 1321/2020: corrige trigger de retenção para verificar a data da
-- ÚLTIMA consulta do animal (não a data da consulta sendo excluída).
-- Conforme a Resolução, o prazo de 5 anos conta a partir do último atendimento.

CREATE OR REPLACE FUNCTION public.check_consultation_cfmv_retention()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_last_consultation timestamptz;
  v_retention_until   date;
BEGIN
  SELECT MAX(created_at) INTO v_last_consultation
  FROM public.consultations
  WHERE patient_id = OLD.patient_id;

  IF v_last_consultation > (now() - INTERVAL '5 years') THEN
    v_retention_until := (v_last_consultation + INTERVAL '5 years')::date;
    RAISE EXCEPTION
      'Não é possível excluir prontuário conforme Resolução CFMV 1321/2020. '
      'O último atendimento deste animal foi em %. '
      'Retenção obrigatória até: %.',
      v_last_consultation::date, v_retention_until
      USING ERRCODE = 'P0001', HINT = 'CFMV_RETENTION_5Y';
  END IF;

  RETURN OLD;
END;
$$;

-- Adiciona archived_at para deleção lógica (alternativa LGPD-segura ao DELETE físico)
ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS consultations_archived_at_idx
  ON public.consultations (archived_at)
  WHERE archived_at IS NOT NULL;
