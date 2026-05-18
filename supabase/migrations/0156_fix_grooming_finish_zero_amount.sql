-- ─── 0156: rpc_grooming_finish_and_record_payment — correções pós-0128 ───────
-- Corrige duas regressões introduzidas pela migration 0128:
--
-- (1) payment_status='recorded' viola o CHECK ('pending'|'paid'|'waived'); o
--     contrato correto (preservado de 0047) é setar payment_status='paid' e
--     current_status='paid' ao concluir o pagamento.
-- (2) Quando price_total=0, a entrada `pending` (criada pelo trigger
--     trg_grooming_session_pending_cashier) deve ser DELETADA em vez de
--     atualizada com amount=0/status=recorded — preserva a semântica
--     "sessions com preço 0 não geram lançamento no caixa".
--
-- Também adiciona um saneamento defensivo: caso existam múltiplas entradas
-- `pending` para a mesma sessão (decorrente de testes ou backfills), mantém
-- somente a mais recente antes do UPDATE…RETURNING…INTO (evita P0003
-- "query returned more than one row").
--
-- O RETURN volta a expor (session_id, current_status, cashier_entry_id,
-- timestamp) por compatibilidade com o contrato anterior.

DROP FUNCTION IF EXISTS rpc_grooming_finish_and_record_payment(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION rpc_grooming_finish_and_record_payment(
  p_session_id UUID,
  p_actor_id   UUID,
  p_reason     TEXT DEFAULT NULL
)
RETURNS TABLE (
  session_id        UUID,
  current_status    TEXT,
  cashier_entry_id  UUID,
  "timestamp"       TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session       RECORD;
  v_cashier_id    UUID;
  v_payment_total NUMERIC;
  v_patient_name  TEXT;
  v_tutor_name    TEXT;
BEGIN
  SELECT gs.id, gs.clinic_id, gs.current_status, gs.price_total,
         gs.payment_status, p.name AS patient_name, t.name AS tutor_name
    INTO v_session
    FROM grooming_sessions gs
    LEFT JOIN patients p ON p.id = gs.patient_id
    LEFT JOIN tutors   t ON t.id = gs.tutor_id
   WHERE gs.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão de grooming não encontrada: %', p_session_id;
  END IF;

  -- Já paga → bloqueia checkout duplo (preserva contrato de 0047)
  IF v_session.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Sessão já paga: %', p_session_id;
  END IF;

  v_payment_total := COALESCE(v_session.price_total, 0);
  v_patient_name  := v_session.patient_name;
  v_tutor_name    := v_session.tutor_name;

  -- Saneamento: consolida múltiplas entradas pending → mantém só a mais recente
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY source_module, source_id
             ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM central_cashier
     WHERE source_module = 'grooming'
       AND source_id     = p_session_id
       AND status        = 'pending'
  )
  DELETE FROM central_cashier
   WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

  -- Caminho A: amount=0 → remove entrada pending residual e marca paid
  IF v_payment_total <= 0 THEN
    DELETE FROM central_cashier
     WHERE source_module = 'grooming'
       AND source_id     = p_session_id
       AND status        = 'pending';

    UPDATE grooming_sessions
       SET current_status      = 'paid',
           payment_status      = 'paid',
           payment_recorded_at = now(),
           updated_at          = now()
     WHERE id = p_session_id;

    RETURN QUERY SELECT p_session_id, 'paid'::TEXT, NULL::UUID, now()::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Caminho B: amount>0 → atualiza entrada pendente ou cria nova registrada
  UPDATE central_cashier
    SET status         = 'recorded',
        amount         = v_payment_total,
        recorded_by    = p_actor_id,
        payment_method = 'cash'
  WHERE source_module = 'grooming'
    AND source_id     = p_session_id
    AND status        = 'pending'
  RETURNING id INTO v_cashier_id;

  IF v_cashier_id IS NULL THEN
    SELECT id INTO v_cashier_id
      FROM central_cashier
     WHERE source_module = 'grooming' AND source_id = p_session_id
     LIMIT 1;

    IF v_cashier_id IS NULL THEN
      INSERT INTO central_cashier (
        clinic_id, source_module, source_id, amount, status,
        reason, patient_name, tutor_name, recorded_by
      ) VALUES (
        v_session.clinic_id, 'grooming', p_session_id, v_payment_total, 'recorded',
        COALESCE(p_reason, 'Banho e Tosa — pagamento'),
        v_patient_name, v_tutor_name, p_actor_id
      )
      RETURNING id INTO v_cashier_id;
    END IF;
  END IF;

  UPDATE grooming_sessions
     SET current_status      = 'paid',
         payment_status      = 'paid',
         payment_recorded_at = now(),
         updated_at          = now()
   WHERE id = p_session_id;

  RETURN QUERY SELECT p_session_id, 'paid'::TEXT, v_cashier_id, now()::TIMESTAMPTZ;
END;
$$;
