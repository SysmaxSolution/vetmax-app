-- ════════════════════════════════════════════════════════════════════════════
-- 0419 — Status `awaiting_review` (Opção A / Fase 2.2 — council 2026-08-10)
--
-- "Enviar ao caixa sem finalizar": a consulta é COBRADA (fatura + pending no
-- caixa) mas o prontuário AINDA NÃO é assinado. Estado EDITÁVEL — a trava de
-- imutabilidade 0411 só morde em status='completed' AND is_reviewed_by_vet=TRUE.
--
-- Decisão de modelagem (reduz blast radius): `awaiting_review` é um estado
-- PÓS-ENCONTRO (o pet já foi cobrado / está indo ao caixa), NÃO um fluxo ativo.
-- Por isso NÃO entra:
--   - nos flow guards 0418 (fn_guard_consultation_flow / _hospitalization_flow)
--   - no índice uniq_consultation_active_per_patient
--   - em pet_active_attendance 0399
-- Assim o MESMO pet pode iniciar um novo atendimento enquanto o prontuário
-- anterior aguarda a assinatura da MV (correto para o fluxo da Almavet).
--
-- Migration puramente aditiva: só amplia o CHECK de consultations.status.
-- ════════════════════════════════════════════════════════════════════════════

-- Remove o CHECK atual do status (localizado pelo valor 'in_progress', que é
-- exclusivo do constraint de status — evita casar com payment_status_check).
DO $$
DECLARE v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
    FROM pg_constraint
   WHERE conrelid = 'public.consultations'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) LIKE '%''in_progress''%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.consultations DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.consultations
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
    'hospitalized',
    'revisao_pos_internacao',
    'awaiting_review'
  ));
