-- ─── 1) Retenção de prontuário conforme CFMV Res. 1321/2020, §3º ──────────────
-- Bloqueia DELETE físico em consultations com menos de 5 anos.
-- Clínicas devem usar arquivamento (campo archived_at) em vez de exclusão.

CREATE OR REPLACE FUNCTION public.check_consultation_cfmv_retention()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.created_at > now() - INTERVAL '5 years' THEN
    RAISE EXCEPTION
      'Não é possível excluir prontuário recente conforme Resolução CFMV 1321/2020. '
      'Prontuários veterinários devem ser retidos por no mínimo 5 anos após o último atendimento. '
      'Use a opção de arquivamento para ocultar este registro sem excluí-lo.'
      USING ERRCODE = 'P0001',
            HINT    = 'CFMV_RETENTION_5Y';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS consultation_cfmv_retention_check ON public.consultations;
CREATE TRIGGER consultation_cfmv_retention_check
  BEFORE DELETE ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.check_consultation_cfmv_retention();

-- ─── 2) Campos de aceite nos pending_registrations ────────────────────────────
-- Captura timestamp e IP do aceite no momento do cadastro (antes da confirmação
-- de e-mail). O callback /auth/callback persiste no legal_acceptances após confirmar.

ALTER TABLE public.pending_registrations
  ADD COLUMN IF NOT EXISTS terms_accepted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS terms_ip           inet,
  ADD COLUMN IF NOT EXISTS terms_user_agent   text;
