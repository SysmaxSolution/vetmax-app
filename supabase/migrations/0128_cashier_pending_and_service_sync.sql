-- ─── 0128: Status "pending" no Caixa + Sincronização automática de serviços ────
-- Serviços lançados (consulta, grooming, etc.) aparecem no Caixa Central e
-- no Financeiro como PENDENTES antes do pagamento ser confirmado.
-- Quando o pagamento é confirmado, ambos transitam automaticamente para "pago".

-- ─── 1. Adiciona 'pending' ao CHECK de central_cashier.status ────────────────

DO $$
BEGIN
  -- Remove constraint existente
  ALTER TABLE central_cashier DROP CONSTRAINT IF EXISTS central_cashier_status_check;
  -- Recria com 'pending'
  ALTER TABLE central_cashier ADD CONSTRAINT central_cashier_status_check
    CHECK (status IN ('pending','recorded','verified','archived','reversed'));
END$$;

-- ─── 2. Atualiza trigger de sincronização (suporta pending → financial pending)

CREATE OR REPLACE FUNCTION fn_sync_cashier_entry_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;

  IF NOT EXISTS (SELECT 1 FROM financial_entries WHERE cashier_entry_id = NEW.id) THEN
    INSERT INTO financial_entries (
      clinic_id, type, description, amount,
      due_date, payment_date, status, payment_method,
      source, cashier_entry_id, created_by,
      created_at, updated_at
    ) VALUES (
      NEW.clinic_id,
      'receivable',
      COALESCE(NULLIF(TRIM(NEW.reason), ''), 'Lançamento do Caixa — ' || COALESCE(NEW.source_module, 'manual')),
      NEW.amount,
      NEW.created_at::DATE,
      CASE WHEN NEW.status = 'pending' THEN NULL ELSE NEW.created_at::DATE END,
      CASE WHEN NEW.status = 'pending' THEN 'pending' ELSE 'paid' END,
      NEW.payment_method,
      'cashier',
      NEW.id,
      NEW.recorded_by,
      NEW.created_at,
      NEW.created_at
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 3. Novo trigger: pending → recorded → atualiza financial_entries ──────────

CREATE OR REPLACE FUNCTION fn_sync_cashier_status_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Quando lançamento do caixa é confirmado (pending→recorded), paga o título
  IF NEW.status IN ('recorded','verified') AND OLD.status = 'pending' THEN
    UPDATE financial_entries
    SET    status         = 'paid',
           payment_date   = COALESCE(NEW.created_at::DATE, CURRENT_DATE),
           payment_method = NEW.payment_method,
           updated_at     = now()
    WHERE  cashier_entry_id = NEW.id
      AND  status = 'pending';
  END IF;

  -- Quando lançamento é revertido, cancela o título pendente ou pago
  IF NEW.status = 'reversed' AND OLD.status <> 'reversed' THEN
    UPDATE financial_entries
    SET    status = 'cancelled', updated_at = now()
    WHERE  cashier_entry_id = NEW.id
      AND  status <> 'cancelled';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashier_status_to_financial   ON central_cashier;
DROP TRIGGER IF EXISTS trg_cashier_reversal_to_financial ON central_cashier;

CREATE TRIGGER trg_cashier_status_to_financial
  AFTER UPDATE ON central_cashier
  FOR EACH ROW EXECUTE FUNCTION fn_sync_cashier_status_to_financial();

-- ─── 4. Grooming: entrada pendente ao criar sessão ───────────────────────────

CREATE OR REPLACE FUNCTION fn_grooming_session_pending_cashier()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_patient_name TEXT;
  v_tutor_name   TEXT;
  v_price        NUMERIC;
BEGIN
  SELECT p.name, t.name
    INTO v_patient_name, v_tutor_name
    FROM patients p
    LEFT JOIN tutors t ON t.id = NEW.tutor_id
   WHERE p.id = NEW.patient_id
   LIMIT 1;

  -- price_total pode não existir na versão 0032; tenta acessar dinamicamente
  BEGIN
    SELECT COALESCE(NEW.price_total, 0) INTO v_price;
  EXCEPTION WHEN undefined_column THEN
    v_price := 0;
  END;

  IF v_price > 0 THEN
    INSERT INTO central_cashier (
      clinic_id, source_module, source_id, amount, status,
      reason, patient_name, tutor_name, recorded_by, created_at
    ) VALUES (
      NEW.clinic_id, 'grooming', NEW.id, v_price, 'pending',
      'Banho e Tosa — ' || COALESCE(v_patient_name, ''),
      v_patient_name, v_tutor_name, NEW.created_by, NEW.created_at
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grooming_session_pending_cashier ON grooming_sessions;
CREATE TRIGGER trg_grooming_session_pending_cashier
  AFTER INSERT ON grooming_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_grooming_session_pending_cashier();

-- ─── 5. Grooming: confirmar pagamento atualiza entrada (pending→recorded) ─────

DROP FUNCTION IF EXISTS rpc_grooming_finish_and_record_payment(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION rpc_grooming_finish_and_record_payment(
  p_session_id UUID,
  p_actor_id   UUID,
  p_reason     TEXT DEFAULT NULL
)
RETURNS TABLE (cashier_entry_id UUID, "timestamp" TIMESTAMPTZ)
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

  IF v_session.payment_status = 'recorded' THEN
    SELECT id INTO v_cashier_id
      FROM central_cashier
     WHERE source_module = 'grooming' AND source_id = p_session_id
     LIMIT 1;
    RETURN QUERY SELECT v_cashier_id, now()::TIMESTAMPTZ;
    RETURN;
  END IF;

  v_payment_total := COALESCE(v_session.price_total, 0);
  v_patient_name  := v_session.patient_name;
  v_tutor_name    := v_session.tutor_name;

  -- Atualiza entrada pendente existente, ou insere nova
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
    -- Sem entrada pendente: insere nova registrada
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

  -- Atualiza a sessão
  UPDATE grooming_sessions
     SET payment_status      = 'recorded',
         payment_recorded_at = now()
   WHERE id = p_session_id;

  RETURN QUERY SELECT v_cashier_id, now()::TIMESTAMPTZ;
END;
$$;

-- ─── 6. Consulta: rpc_record_invoice_payment trata entrada pendente ───────────

CREATE OR REPLACE FUNCTION rpc_record_invoice_payment(
  p_clinic_id      UUID,
  p_invoice_id     UUID,
  p_amount         NUMERIC(12,2),
  p_payment_method TEXT,
  p_patient_name   TEXT,
  p_tutor_name     TEXT,
  p_recorded_by    UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_cashier_id UUID;
BEGIN
  -- Idempotente: já foi pago
  IF EXISTS (
    SELECT 1 FROM central_cashier
     WHERE source_module = 'consultation'
       AND source_id     = p_invoice_id
       AND status        IN ('recorded','verified')
  ) THEN RETURN; END IF;

  -- Atualiza entrada pendente existente
  UPDATE central_cashier
     SET status         = 'recorded',
         amount         = p_amount,
         payment_method = p_payment_method,
         patient_name   = p_patient_name,
         tutor_name     = p_tutor_name,
         recorded_by    = p_recorded_by
   WHERE source_module = 'consultation'
     AND source_id     = p_invoice_id
     AND status        = 'pending'
  RETURNING id INTO v_cashier_id;

  IF v_cashier_id IS NOT NULL THEN RETURN; END IF;

  -- Sem entrada pendente: insere nova
  INSERT INTO central_cashier (
    clinic_id, source_module, source_id, amount, status,
    payment_method, patient_name, tutor_name, reason, recorded_by
  ) VALUES (
    p_clinic_id, 'consultation', p_invoice_id, p_amount, 'recorded',
    p_payment_method, p_patient_name, p_tutor_name,
    'Consulta — ' || p_patient_name, p_recorded_by
  );
END;
$$;

-- ─── 7. Backfill: invoices pendentes → central_cashier pending ───────────────

INSERT INTO central_cashier (
  clinic_id, source_module, source_id, amount, status,
  reason, patient_name, tutor_name, recorded_by, created_at
)
SELECT
  i.clinic_id,
  'consultation',
  i.id,
  GREATEST(i.total_amount, 0),
  'pending',
  'Consulta — ' || COALESCE(p.name, 'Paciente'),
  p.name,
  t.name,
  NULL,
  i.created_at
FROM invoices i
LEFT JOIN patients p ON p.id = i.patient_id
LEFT JOIN tutors   t ON t.id = i.tutor_id
WHERE i.status = 'pending'
  AND i.total_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM central_cashier cc
     WHERE cc.source_module = 'consultation'
       AND cc.source_id     = i.id
  );

-- ─── 8a. Atualiza rpc_get_cashier_dashboard: pendentes via central_cashier ───
--   Antes: pending vinha de invoices + grooming_sessions
--   Depois: pending vem de central_cashier.status='pending'
--   total_inflows exclui status='pending' (só conta dinheiro confirmado)

CREATE OR REPLACE FUNCTION rpc_get_cashier_dashboard(
  p_clinic_id  UUID,
  p_date       DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_inflows       NUMERIC,
  total_outflows      NUMERIC,
  net_balance         NUMERIC,
  pending_amount      NUMERIC,
  pending_count       INTEGER,
  session_id          UUID,
  session_status      TEXT,
  opening_balance     NUMERIC,
  by_payment_method   JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role            TEXT;
  v_user_clinic          UUID;
  v_inflows              NUMERIC := 0;
  v_outflows             NUMERIC := 0;
  v_pending_amount       NUMERIC := 0;
  v_pending_count        INTEGER := 0;
  v_sess_id              UUID;
  v_sess_status          TEXT;
  v_sess_opening_balance NUMERIC := 0;
  v_by_method            JSONB   := '{}'::jsonb;
BEGIN
  SELECT role, clinic_id INTO v_user_role, v_user_clinic
    FROM profiles WHERE id = auth.uid();

  IF v_user_clinic IS NULL OR v_user_clinic <> p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido';
  END IF;
  IF v_user_role NOT IN ('admin','owner','manager','accountant','receptionist') THEN
    RAISE EXCEPTION 'Acesso negado ao dashboard do caixa';
  END IF;

  -- Recebimentos confirmados do dia (exclui pending e reversed)
  SELECT COALESCE(SUM(amount), 0) INTO v_inflows
    FROM central_cashier
   WHERE clinic_id = p_clinic_id
     AND DATE(created_at) = p_date
     AND status IN ('recorded','verified')
     AND amount > 0;

  -- Saídas do dia
  SELECT COALESCE(SUM(amount), 0) INTO v_outflows
    FROM cashier_outflows
   WHERE clinic_id = p_clinic_id
     AND DATE(created_at) = p_date;

  -- Pendentes: usa central_cashier como fonte única
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_pending_amount, v_pending_count
    FROM central_cashier
   WHERE clinic_id = p_clinic_id
     AND status    = 'pending'
     AND amount    > 0;

  -- Sessão aberta
  SELECT id, status, COALESCE(opening_balance, 0)
    INTO v_sess_id, v_sess_status, v_sess_opening_balance
    FROM cashier_sessions
   WHERE clinic_id = p_clinic_id AND status = 'open'
   LIMIT 1;

  -- Breakdown por forma de pagamento (só confirmados do dia)
  SELECT COALESCE(jsonb_object_agg(
           method, jsonb_build_object('amount', amt, 'count', cnt)
         ), '{}'::jsonb)
    INTO v_by_method
    FROM (
      SELECT COALESCE(payment_method,'nao_informado') AS method,
             SUM(amount) AS amt, COUNT(*) AS cnt
        FROM central_cashier
       WHERE clinic_id = p_clinic_id
         AND DATE(created_at) = p_date
         AND status IN ('recorded','verified')
         AND amount > 0
       GROUP BY 1
    ) t;

  RETURN QUERY SELECT
    v_inflows, v_outflows,
    (v_inflows - v_outflows + COALESCE(v_sess_opening_balance,0))::NUMERIC,
    v_pending_amount, v_pending_count,
    v_sess_id, v_sess_status, v_sess_opening_balance,
    v_by_method;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_cashier_dashboard(UUID, DATE) TO authenticated;

-- ─── 8. Backfill: grooming sessions ativas sem entrada no caixa ──────────────

INSERT INTO central_cashier (
  clinic_id, source_module, source_id, amount, status,
  reason, patient_name, tutor_name, recorded_by, created_at
)
SELECT
  gs.clinic_id,
  'grooming',
  gs.id,
  COALESCE(gs.price_total, 0),
  CASE WHEN gs.payment_status = 'recorded' THEN 'recorded' ELSE 'pending' END,
  'Banho e Tosa — ' || COALESCE(p.name, ''),
  p.name,
  t.name,
  gs.created_by,
  gs.created_at
FROM grooming_sessions gs
LEFT JOIN patients p ON p.id = gs.patient_id
LEFT JOIN tutors   t ON t.id = gs.tutor_id
WHERE COALESCE(gs.price_total, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM central_cashier cc
     WHERE cc.source_module = 'grooming'
       AND cc.source_id     = gs.id
  );
