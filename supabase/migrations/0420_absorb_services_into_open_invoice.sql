-- ════════════════════════════════════════════════════════════════════════════
-- 0420 — Agrupamento no caixa: absorver serviços na fatura aberta (Fase 2.3 / D2)
--
-- Council 2026-08-10: quando a MV lança um serviço DEPOIS de "Enviar ao caixa"
-- mas ANTES de qualquer pagamento, o novo serviço deve entrar na MESMA fatura
-- pendente → um ÚNICO recebimento para a recepção. Se já houve pagamento
-- (central_cashier 'recorded'/'verified'), NÃO se toca no que foi pago: cai no
-- caminho de fatura complementar (generatePartialInvoice, no app).
--
-- Segurança (caminho do dinheiro): tudo dentro de UMA transação da função, com
-- SELECT ... FOR UPDATE na fatura e no lançamento do caixa. Se o recebimento
-- estiver em curso, o lock serializa e o guard de status faz a função abortar
-- (retorna vazio) — o app então gera a complementar. Sem double-charge, sem
-- perder pagamento.
--
-- Fonte da verdade do valor pago = itens da invoice (rpc_record_invoice_payment
-- sobrescreve central_cashier.amount no pagamento). Aqui mantemos invoice,
-- central_cashier.amount e financial_entries.amount coerentes para o PENDENTE.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_absorb_services_into_open_invoice(
  p_clinic_id        UUID,
  p_consultation_id  UUID
)
RETURNS TABLE (out_invoice_id UUID, out_tutor_due NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id  UUID;
  v_cc_id       UUID;
  v_cc_status   TEXT;
  v_added_total NUMERIC := 0;
  v_added_tutor NUMERIC := 0;
  v_new_amount  NUMERIC := 0;
  r             RECORD;
  v_item_type   TEXT;
  v_line        NUMERIC;
  v_copay       NUMERIC;
BEGIN
  -- 1. Fatura ABERTA (pendente, nada pago) mais recente da consulta — travada.
  SELECT id INTO v_invoice_id
    FROM invoices
   WHERE clinic_id       = p_clinic_id
     AND consultation_id = p_consultation_id
     AND status          = 'pending'
     AND COALESCE(paid_amount, 0) < 0.01
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_invoice_id IS NULL THEN
    RETURN;  -- sem fatura absorvível → app gera fatura (parcial) normal
  END IF;

  -- 2. Lançamento do caixa vinculado — travado. Só absorve se ainda 'pending'.
  SELECT id, status INTO v_cc_id, v_cc_status
    FROM central_cashier
   WHERE source_module = 'consultation'
     AND source_id     = v_invoice_id
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_cc_id IS NULL OR v_cc_status <> 'pending' THEN
    RETURN;  -- em pagamento/pago (ou sem pending) → app gera complementar
  END IF;

  -- 3. Serviços não faturados → viram itens da fatura aberta.
  FOR r IN
    SELECT cs.id,
           cs.name_snapshot,
           COALESCE(cs.price_snapshot, 0) AS unit,
           COALESCE(cs.quantity, 1)       AS qty,
           cs.copay_snapshot,
           si.category
      FROM consultation_services cs
      LEFT JOIN stock_items si ON si.id = cs.stock_item_id
     WHERE cs.clinic_id            = p_clinic_id
       AND cs.consultation_id      = p_consultation_id
       AND cs.cancelled_at         IS NULL
       AND cs.billed_in_invoice_id IS NULL
     ORDER BY cs.created_at ASC
     FOR UPDATE OF cs
  LOOP
    v_line  := r.unit * r.qty;
    v_copay := CASE WHEN r.copay_snapshot IS NULL THEN NULL ELSE ROUND(r.copay_snapshot * r.qty, 2) END;
    v_item_type := CASE
      WHEN r.category = 'exam'                                THEN 'exam'
      WHEN r.category IN ('medication','controlled_medication') THEN 'medication'
      WHEN r.category IN ('vet_service','service')            THEN 'consultation'
      ELSE 'other'
    END;

    INSERT INTO invoice_items (
      invoice_id, item_type, description, quantity, unit_price, total_price,
      insurance_status, coparticipation_value
    ) VALUES (
      v_invoice_id, v_item_type, r.name_snapshot, r.qty, r.unit, v_line,
      CASE WHEN v_copay IS NULL THEN 'particular' ELSE 'aguardando_repasse' END,
      v_copay
    );

    UPDATE consultation_services
       SET billed_in_invoice_id = v_invoice_id
     WHERE id = r.id;

    v_added_total := v_added_total + v_line;
    v_added_tutor := v_added_tutor + COALESCE(v_copay, v_line);
  END LOOP;

  -- 4. Nada novo para absorver: a fatura já é o recibo único.
  IF v_added_total = 0 THEN
    RETURN QUERY SELECT v_invoice_id, (SELECT amount FROM central_cashier WHERE id = v_cc_id);
    RETURN;
  END IF;

  -- 5. Atualiza fatura + caixa + financeiro (mantém 1 recibo).
  UPDATE invoices
     SET subtotal     = COALESCE(subtotal, 0)     + v_added_total,
         total_amount = COALESCE(total_amount, 0) + v_added_total
   WHERE id = v_invoice_id;

  UPDATE central_cashier
     SET amount = amount + v_added_tutor
   WHERE id = v_cc_id
   RETURNING amount INTO v_new_amount;

  UPDATE financial_entries
     SET amount     = amount + v_added_tutor,
         updated_at = now()
   WHERE cashier_entry_id = v_cc_id
     AND status = 'pending';

  RETURN QUERY SELECT v_invoice_id, v_new_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_absorb_services_into_open_invoice(UUID, UUID) TO authenticated;
