-- =============================================================================
-- VetMax — Migration 0205: edição de parcela de cartão (rpc_update_card_installment)
--
-- Permite editar uma movimentação de cartão (Financeiro > Cartões) a partir do
-- modal de detalhe: dados de conciliação (NSU, liberação, administradora,
-- bandeira, data da transação) + valores (bruto/taxa → recalcula líquido).
-- Mantém o título a receber vinculado (financial_entries pending) coerente:
-- pending_entry.amount = bruto da parcela. SOMENTE parcelas 'pending'.
--
-- Idempotente (CREATE OR REPLACE). transaction_date já existe em card_installments
-- desde a migration 0194 (NOT NULL DEFAULT CURRENT_DATE) — nada a alterar no schema.
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_update_card_installment(
  p_installment_id           UUID,
  p_clinic_id                UUID,
  p_updated_by               UUID,
  p_card_nsu                 TEXT,
  p_card_authorization       TEXT,
  p_card_acquirer            TEXT,
  p_card_brand               TEXT,
  p_transaction_date         DATE,
  p_gross_amount             NUMERIC,
  p_fee_percent              NUMERIC,
  p_expected_settlement_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst   card_installments%ROWTYPE;
  v_gross  NUMERIC;
  v_pct    NUMERIC;
  v_fee    NUMERIC;
  v_net    NUMERIC;
BEGIN
  SELECT * INTO v_inst
    FROM card_installments
   WHERE id = p_installment_id AND clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela de cartão não encontrada para esta clínica.';
  END IF;

  IF v_inst.status <> 'pending' THEN
    RAISE EXCEPTION 'Apenas parcelas pendentes podem ser editadas (status atual: %).', v_inst.status;
  END IF;

  v_gross := COALESCE(p_gross_amount, v_inst.gross_amount);
  v_pct   := COALESCE(p_fee_percent,  v_inst.fee_percent);
  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Valor bruto deve ser maior que zero.';
  END IF;
  IF v_pct < 0 OR v_pct > 100 THEN
    RAISE EXCEPTION 'Taxa deve estar entre 0%% e 100%%.';
  END IF;

  v_fee := ROUND(v_gross * v_pct / 100, 2);
  v_net := v_gross - v_fee;

  UPDATE card_installments SET
    card_nsu                 = NULLIF(p_card_nsu, ''),
    card_authorization       = NULLIF(p_card_authorization, ''),
    card_acquirer            = NULLIF(p_card_acquirer, ''),
    card_brand               = NULLIF(p_card_brand, ''),
    transaction_date         = COALESCE(p_transaction_date, transaction_date),
    gross_amount             = v_gross,
    fee_percent              = v_pct,
    fee_amount               = v_fee,
    net_amount               = v_net,
    expected_settlement_date = COALESCE(p_expected_settlement_date, expected_settlement_date)
  WHERE id = p_installment_id;

  -- Mantém o A Receber da operadora (pending entry) coerente: amount = bruto.
  IF v_inst.pending_entry_id IS NOT NULL THEN
    UPDATE financial_entries SET
      amount   = v_gross,
      due_date = COALESCE(p_expected_settlement_date, due_date),
      notes    = CASE
                   WHEN NULLIF(p_card_nsu, '') IS NOT NULL
                   THEN 'NSU ' || p_card_nsu || COALESCE(' · Lib ' || NULLIF(p_card_authorization, ''), '')
                   ELSE notes
                 END
    WHERE id = v_inst.pending_entry_id
      AND clinic_id = p_clinic_id
      AND status = 'pending';
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'gross_amount', v_gross,
    'fee_amount',   v_fee,
    'net_amount',   v_net
  );
END;
$$;

COMMENT ON FUNCTION rpc_update_card_installment IS
  'Edita uma parcela de cartão pendente (conciliação + valores) e mantém o financial_entry pending vinculado coerente. Migration 0205.';
