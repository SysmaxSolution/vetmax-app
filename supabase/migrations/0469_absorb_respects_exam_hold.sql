-- ════════════════════════════════════════════════════════════════════════════
-- 0469 — rpc_absorb_services_into_open_invoice respeita a trava de cobrança do
-- fluxo de rejeição de exame (0468).
--
-- Única diferença em relação à 0420: o loop do passo 3 ganha o predicado
--   (v_use_rejection_flow = FALSE OR cs.exam_billing_hold_at IS NULL)
-- onde v_use_rejection_flow vem de clinics.flow_config->>'usa_fluxo_rejeicao_exame'.
-- Para toda clínica sem a flag o predicado é constante TRUE → o comportamento é
-- bit-a-bit o da 0420. Nenhum default, nenhum trigger novo.
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
  v_use_rejection_flow BOOLEAN := FALSE;
BEGIN
  -- 0. Flag da clínica. Ausente/false → daqui pra frente tudo igual à 0420.
  SELECT COALESCE((flow_config->>'usa_fluxo_rejeicao_exame')::boolean, FALSE)
    INTO v_use_rejection_flow
    FROM clinics WHERE id = p_clinic_id;

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
       AND (v_use_rejection_flow = FALSE OR cs.exam_billing_hold_at IS NULL)
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
