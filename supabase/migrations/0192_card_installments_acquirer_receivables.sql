-- =============================================================================
-- VetMax — Migration 0192: Recebíveis de Cartão (administradora)
--
-- Quando o tutor paga com cartão, o cliente quita seu débito imediatamente,
-- mas o repasse da administradora só chega depois (D+N, descontando taxa).
-- Esta migration introduz:
--   1. card_installments: 1 linha por parcela do cartão. Cada parcela tem
--      data prevista de repasse, valor bruto/líquido/taxa e status próprio.
--   2. financial_entries.source = 'card_acquirer': representa o A Receber da
--      administradora (não do cliente). Permanece pending até a operadora
--      pagar; baixado via Financeiro > Cartões.
--   3. RPC rpc_record_split_payment atualizada: para crédito/débito, gera
--      card_installments + pending entries source=card_acquirer (em vez do
--      paid entry source=cashier).
--   4. RPC rpc_settle_card_installment: liquida a parcela e gera o lançamento
--      paid correspondente (entrada efetiva no banco).
-- =============================================================================

BEGIN;

-- ─── 1) Estende source de financial_entries ────────────────────────────────

ALTER TABLE financial_entries
  DROP CONSTRAINT IF EXISTS financial_entries_source_check;

ALTER TABLE financial_entries
  ADD CONSTRAINT financial_entries_source_check
  CHECK (source IN ('manual', 'cashier', 'commission', 'petlove', 'petlove_indicacao', 'petlove_open', 'card_acquirer'));

COMMENT ON CONSTRAINT financial_entries_source_check ON financial_entries IS
  'source=card_acquirer indica A Receber da administradora de cartão, baixado quando a operadora repassa.';

-- ─── 2) card_installments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS card_installments (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  split_id                 UUID         NOT NULL REFERENCES invoice_payment_splits(id) ON DELETE CASCADE,
  invoice_id               UUID         REFERENCES invoices(id) ON DELETE SET NULL,
  sale_id                  UUID         NULL,
  payment_card_id          UUID         NULL REFERENCES clinic_payment_cards(id) ON DELETE SET NULL,

  installment_number       INT          NOT NULL CONSTRAINT card_installments_num_positive CHECK (installment_number >= 1),
  total_installments       INT          NOT NULL CONSTRAINT card_installments_total_positive CHECK (total_installments >= 1),

  payment_method           TEXT         NOT NULL,
  card_acquirer            TEXT         NULL,
  card_brand               TEXT         NULL,
  card_nsu                 TEXT         NULL,
  card_authorization       TEXT         NULL,

  gross_amount             NUMERIC(12,2) NOT NULL CONSTRAINT card_installments_gross_positive CHECK (gross_amount > 0),
  fee_percent              NUMERIC(5,2)  NOT NULL DEFAULT 0 CONSTRAINT card_installments_fee_percent_check CHECK (fee_percent >= 0 AND fee_percent <= 100),
  fee_amount               NUMERIC(12,2) NOT NULL DEFAULT 0 CONSTRAINT card_installments_fee_amount_check CHECK (fee_amount >= 0),
  net_amount               NUMERIC(12,2) NOT NULL CONSTRAINT card_installments_net_positive CHECK (net_amount >= 0),

  expected_settlement_date DATE          NOT NULL,

  status                   TEXT          NOT NULL DEFAULT 'pending',
  settled_at               TIMESTAMPTZ   NULL,
  settled_amount           NUMERIC(12,2) NULL,
  settled_by               UUID          REFERENCES profiles(id),

  pending_entry_id         UUID          REFERENCES financial_entries(id) ON DELETE SET NULL,
  settled_entry_id         UUID          REFERENCES financial_entries(id) ON DELETE SET NULL,

  bank_statement_ref       TEXT          NULL,
  reconciled_at            TIMESTAMPTZ   NULL,
  reconciled_by            UUID          REFERENCES profiles(id),

  notes                    TEXT          NULL,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT card_installments_status_check
    CHECK (status IN ('pending', 'settled', 'reconciled', 'cancelled')),

  CONSTRAINT card_installments_method_check
    CHECK (payment_method IN ('credit', 'debit', 'voucher'))
);

COMMENT ON TABLE  card_installments IS 'Parcelas de pagamentos com cartão — uma linha por parcela. Status pending → settled quando a operadora repassa.';
COMMENT ON COLUMN card_installments.gross_amount             IS 'Valor bruto da parcela (sem desconto da taxa).';
COMMENT ON COLUMN card_installments.fee_percent              IS 'Taxa percentual cobrada pela operadora.';
COMMENT ON COLUMN card_installments.fee_amount               IS 'Valor monetário da taxa (gross_amount * fee_percent / 100).';
COMMENT ON COLUMN card_installments.net_amount               IS 'Valor líquido = gross_amount - fee_amount. É o que a clínica recebe.';
COMMENT ON COLUMN card_installments.expected_settlement_date IS 'Data prevista de repasse pela operadora (D+N do settlement_days do cartão).';
COMMENT ON COLUMN card_installments.status                   IS 'pending: aguardando repasse | settled: repassado manualmente | reconciled: conciliado com extrato | cancelled: cancelado.';
COMMENT ON COLUMN card_installments.pending_entry_id         IS 'FK para financial_entry pending source=card_acquirer enquanto aguarda.';
COMMENT ON COLUMN card_installments.settled_entry_id         IS 'FK para financial_entry paid criado na liquidação.';

CREATE INDEX IF NOT EXISTS idx_card_installments_clinic_status
  ON card_installments (clinic_id, status, expected_settlement_date);

CREATE INDEX IF NOT EXISTS idx_card_installments_clinic_card
  ON card_installments (clinic_id, payment_card_id)
  WHERE payment_card_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_card_installments_split
  ON card_installments (split_id);

CREATE INDEX IF NOT EXISTS idx_card_installments_clinic_expected
  ON card_installments (clinic_id, expected_settlement_date)
  WHERE status = 'pending';

-- RLS
ALTER TABLE card_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_installments_select" ON card_installments;
CREATE POLICY "card_installments_select"
  ON card_installments FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "card_installments_insert" ON card_installments;
CREATE POLICY "card_installments_insert"
  ON card_installments FOR INSERT
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "card_installments_update" ON card_installments;
CREATE POLICY "card_installments_update"
  ON card_installments FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner','manager','accountant')
  );

-- ─── 3) Helper: calcula expected dates para N parcelas ────────────────────

CREATE OR REPLACE FUNCTION fn_card_installment_dates(
  p_method TEXT,
  p_settlement_days INT,
  p_total_installments INT
)
RETURNS TABLE (installment_number INT, expected_date DATE)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_i INT;
  v_base_days INT := COALESCE(p_settlement_days, CASE WHEN p_method = 'debit' THEN 1 ELSE 30 END);
BEGIN
  FOR v_i IN 1..p_total_installments LOOP
    installment_number := v_i;
    -- Débito: tudo em D+settlement_days. Crédito: parcela N em D+(settlement_days*N) (30, 60, 90...).
    IF p_method = 'debit' THEN
      expected_date := CURRENT_DATE + v_base_days;
    ELSE
      expected_date := CURRENT_DATE + (v_base_days * v_i);
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ─── 4) RPC: rpc_record_split_payment ATUALIZADA ──────────────────────────
-- Para crédito/débito/voucher cria card_installments + pending entry source=card_acquirer.
-- Para cash/pix/transfer cria paid entry source=cashier (como antes).
-- Invoice sempre vai para paid (cliente quitou).

CREATE OR REPLACE FUNCTION rpc_record_split_payment(
  p_clinic_id    UUID,
  p_invoice_id   UUID,
  p_recorded_by  UUID,
  p_patient_name TEXT,
  p_tutor_name   TEXT,
  p_splits       JSONB,
  p_effective_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_split            JSONB;
  v_total_received   NUMERIC := 0;
  v_amount           NUMERIC;
  v_method           TEXT;
  v_card_id          UUID;
  v_installments     INT;
  v_card_acq         TEXT;
  v_card_brand       TEXT;
  v_nsu              TEXT;
  v_auth             TEXT;
  v_split_id         UUID;
  v_entry_id         UUID;
  v_inv_paid         NUMERIC;
  v_inv_total        NUMERIC;
  v_new_paid         NUMERIC;
  v_new_status       TEXT;
  v_eff_date         DATE := COALESCE(p_effective_date, CURRENT_DATE);
  v_tutor_id         UUID;
  v_patient_id       UUID;
  v_is_card          BOOLEAN;
  v_card_row         RECORD;
  v_per_install_grs  NUMERIC;
  v_fee_pct          NUMERIC;
  v_settlement_days  INT;
  v_inst_date        DATE;
  v_inst_num         INT;
  v_per_install_fee  NUMERIC;
  v_per_install_net  NUMERIC;
  v_install_id       UUID;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice_id obrigatório';
  END IF;

  SELECT total_amount, paid_amount, tutor_id, patient_id
    INTO v_inv_total, v_inv_paid, v_tutor_id, v_patient_id
    FROM invoices
   WHERE id = p_invoice_id AND clinic_id = p_clinic_id;

  IF v_inv_total IS NULL THEN
    RAISE EXCEPTION 'Invoice não encontrada para clínica';
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    v_amount       := (v_split->>'amount')::NUMERIC;
    v_method       := v_split->>'payment_method';
    v_card_id      := NULLIF(v_split->>'payment_card_id', '')::UUID;
    v_installments := COALESCE((v_split->>'installments')::INT, 1);
    v_card_acq     := NULLIF(v_split->>'card_acquirer', '');
    v_card_brand   := NULLIF(v_split->>'card_brand', '');
    v_nsu          := NULLIF(v_split->>'card_nsu', '');
    v_auth         := NULLIF(v_split->>'card_authorization', '');

    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Split com valor inválido: %', v_amount;
    END IF;

    IF v_method NOT IN ('pix','credit','debit','cash','voucher','convenio','transfer','other') THEN
      RAISE EXCEPTION 'Método de pagamento inválido: %', v_method;
    END IF;

    v_is_card := v_method IN ('credit', 'debit', 'voucher');

    -- Lookup do cartão para taxa/dias de repasse (se card_id veio)
    v_fee_pct         := 0;
    v_settlement_days := CASE WHEN v_method = 'debit' THEN 1 ELSE 30 END;
    IF v_card_id IS NOT NULL THEN
      SELECT fee_percent, settlement_days INTO v_card_row
        FROM clinic_payment_cards WHERE id = v_card_id AND clinic_id = p_clinic_id;
      IF FOUND THEN
        v_fee_pct         := COALESCE(v_card_row.fee_percent, 0);
        v_settlement_days := COALESCE(v_card_row.settlement_days, v_settlement_days);
      END IF;
    END IF;

    -- Registra o split (sempre, para conciliação)
    INSERT INTO invoice_payment_splits (
      clinic_id, invoice_id, financial_entry_id, amount,
      payment_method, payment_card_id, installments,
      card_acquirer, card_brand, card_nsu, card_authorization,
      effective_date, created_by
    ) VALUES (
      p_clinic_id, p_invoice_id, NULL, v_amount,
      v_method, v_card_id, v_installments,
      v_card_acq, v_card_brand, v_nsu, v_auth,
      v_eff_date, p_recorded_by
    )
    RETURNING id INTO v_split_id;

    IF v_is_card THEN
      -- ─── Cartão: cria card_installments + pending entry por parcela ──
      v_per_install_grs := ROUND(v_amount / v_installments, 2);

      FOR v_inst_num IN 1..v_installments LOOP
        IF v_method = 'debit' OR v_method = 'voucher' THEN
          v_inst_date := CURRENT_DATE + v_settlement_days;
        ELSE
          v_inst_date := CURRENT_DATE + (v_settlement_days * v_inst_num);
        END IF;

        -- Ajusta última parcela para fechar arredondamento
        IF v_inst_num = v_installments THEN
          v_per_install_grs := v_amount - (v_per_install_grs * (v_installments - 1));
        END IF;

        v_per_install_fee := ROUND(v_per_install_grs * v_fee_pct / 100, 2);
        v_per_install_net := v_per_install_grs - v_per_install_fee;

        -- Cria pending entry source=card_acquirer (a receber da operadora)
        INSERT INTO financial_entries (
          clinic_id, type, description, amount,
          due_date, payment_date, status, source, category,
          tutor_id, patient_id, invoice_id, payment_method,
          issue_date, notes, created_by
        ) VALUES (
          p_clinic_id, 'receivable',
          'Cartão ' || v_method || ' · ' || COALESCE(v_card_acq, 'operadora') || ' · ' || v_inst_num || '/' || v_installments ||
            ' · ' || substring(p_invoice_id::TEXT,1,8) || ' · ' || COALESCE(p_patient_name,'—'),
          v_per_install_grs,
          v_inst_date, NULL, 'pending', 'card_acquirer', 'A receber de cartão',
          v_tutor_id, v_patient_id, p_invoice_id, v_method,
          v_eff_date,
          CASE WHEN v_nsu IS NOT NULL THEN 'NSU ' || v_nsu || COALESCE(' · Lib ' || v_auth, '') ELSE NULL END,
          p_recorded_by
        )
        RETURNING id INTO v_entry_id;

        INSERT INTO card_installments (
          clinic_id, split_id, invoice_id, payment_card_id,
          installment_number, total_installments,
          payment_method, card_acquirer, card_brand, card_nsu, card_authorization,
          gross_amount, fee_percent, fee_amount, net_amount,
          expected_settlement_date, status, pending_entry_id
        ) VALUES (
          p_clinic_id, v_split_id, p_invoice_id, v_card_id,
          v_inst_num, v_installments,
          v_method, v_card_acq, v_card_brand, v_nsu, v_auth,
          v_per_install_grs, v_fee_pct, v_per_install_fee, v_per_install_net,
          v_inst_date, 'pending', v_entry_id
        )
        RETURNING id INTO v_install_id;
      END LOOP;

      -- Atualiza split com referência ao primeiro entry (para retrocompat)
      UPDATE invoice_payment_splits
         SET financial_entry_id = (
           SELECT pending_entry_id FROM card_installments WHERE split_id = v_split_id ORDER BY installment_number LIMIT 1
         )
       WHERE id = v_split_id;

    ELSE
      -- ─── Dinheiro/PIX/Transfer/Convênio/Other: entry paid imediato ─────
      INSERT INTO financial_entries (
        clinic_id, type, description, amount,
        due_date, payment_date, status, source, category,
        tutor_id, patient_id, invoice_id, payment_method,
        issue_date, notes, created_by
      ) VALUES (
        p_clinic_id, 'receivable',
        'Baixa invoice ' || substring(p_invoice_id::TEXT,1,8) || ' · ' || COALESCE(p_patient_name,'—') || ' · ' || v_method,
        v_amount,
        v_eff_date, v_eff_date, 'paid', 'cashier', 'Recebimento de fatura',
        v_tutor_id, v_patient_id, p_invoice_id, v_method,
        v_eff_date, NULL, p_recorded_by
      )
      RETURNING id INTO v_entry_id;

      UPDATE invoice_payment_splits SET financial_entry_id = v_entry_id WHERE id = v_split_id;
    END IF;

    -- Sempre lança no central_cashier (a venda aconteceu)
    INSERT INTO central_cashier (
      clinic_id, source_module, source_id, amount, status,
      payment_method, patient_name, tutor_name, reason,
      recorded_by, payment_card_id, card_nsu, card_authorization,
      card_installments, effective_date
    ) VALUES (
      p_clinic_id, 'consultation', p_invoice_id, v_amount, 'recorded',
      v_method, p_patient_name, p_tutor_name,
      'Consulta — ' || COALESCE(p_patient_name,'?'),
      p_recorded_by, v_card_id, v_nsu, v_auth,
      CASE WHEN v_method = 'credit' THEN v_installments ELSE NULL END,
      v_eff_date
    );

    v_total_received := v_total_received + v_amount;
  END LOOP;

  -- Atualiza a invoice — cliente quitou (paid_amount inclui cartões mesmo em pending de repasse)
  v_new_paid := COALESCE(v_inv_paid, 0) + v_total_received;
  IF v_new_paid >= v_inv_total - 0.005 THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'paid_partial';
  END IF;

  UPDATE invoices
     SET paid_amount    = v_new_paid,
         status         = v_new_status,
         paid_at        = CASE WHEN v_new_status = 'paid' THEN now() ELSE NULL END,
         updated_at     = now()
   WHERE id = p_invoice_id AND clinic_id = p_clinic_id;

  IF v_new_status = 'paid' THEN
    DELETE FROM financial_entries
     WHERE clinic_id  = p_clinic_id
       AND invoice_id = p_invoice_id
       AND status     = 'pending'
       AND source     = 'cashier';
  ELSE
    UPDATE financial_entries
       SET amount     = v_inv_total - v_new_paid,
           updated_at = now()
     WHERE clinic_id  = p_clinic_id
       AND invoice_id = p_invoice_id
       AND status     = 'pending'
       AND source     = 'cashier';

    IF NOT FOUND THEN
      INSERT INTO financial_entries (
        clinic_id, type, description, amount,
        due_date, status, source, category,
        tutor_id, patient_id, invoice_id, notes, created_by
      ) VALUES (
        p_clinic_id, 'receivable',
        'Saldo invoice ' || substring(p_invoice_id::TEXT,1,8) || ' · ' || COALESCE(p_patient_name,'—'),
        v_inv_total - v_new_paid,
        CURRENT_DATE, 'pending', 'cashier', 'Saldo a receber',
        v_tutor_id, v_patient_id, p_invoice_id,
        'Saldo após baixa parcial.',
        p_recorded_by
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'invoice_id',     p_invoice_id,
    'paid_amount',    v_new_paid,
    'total_amount',   v_inv_total,
    'status',         v_new_status,
    'splits_count',   jsonb_array_length(p_splits),
    'received_now',   v_total_received
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_split_payment(UUID, UUID, UUID, TEXT, TEXT, JSONB, DATE) TO authenticated;

-- ─── 5) RPC: rpc_settle_card_installment ──────────────────────────────────
-- Liquida uma parcela (status pending → settled), cria o paid entry e
-- atualiza o pending entry vinculado para paid.
--
-- p_settled_amount: valor efetivamente recebido (default = net_amount).
-- p_bank_ref:       referência do extrato para conciliação.
-- p_actual_fee:     taxa efetivamente cobrada (default = fee_amount calculado).

CREATE OR REPLACE FUNCTION rpc_settle_card_installment(
  p_installment_id UUID,
  p_settled_by     UUID,
  p_settled_amount NUMERIC DEFAULT NULL,
  p_bank_ref       TEXT    DEFAULT NULL,
  p_actual_fee     NUMERIC DEFAULT NULL,
  p_settled_date   DATE    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst           RECORD;
  v_role           TEXT;
  v_clinic         UUID;
  v_amount         NUMERIC;
  v_settled_date   DATE := COALESCE(p_settled_date, CURRENT_DATE);
  v_paid_entry_id  UUID;
  v_actual_fee     NUMERIC;
BEGIN
  SELECT role, clinic_id INTO v_role, v_clinic FROM profiles WHERE id = p_settled_by;
  IF v_role NOT IN ('admin','owner','manager','accountant') THEN
    RAISE EXCEPTION 'Sem permissão para liquidar parcela.';
  END IF;

  SELECT * INTO v_inst FROM card_installments
   WHERE id = p_installment_id AND clinic_id = v_clinic
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;
  IF v_inst.status <> 'pending' THEN
    RAISE EXCEPTION 'Parcela já está % — apenas pending pode ser liquidada.', v_inst.status;
  END IF;

  v_amount     := COALESCE(p_settled_amount, v_inst.net_amount);
  v_actual_fee := COALESCE(p_actual_fee, v_inst.fee_amount);

  -- Atualiza o pending entry: status=paid com payment_date
  IF v_inst.pending_entry_id IS NOT NULL THEN
    UPDATE financial_entries
       SET status         = 'paid',
           payment_date   = v_settled_date,
           amount         = v_amount,
           notes          = COALESCE(notes,'') ||
                            CASE WHEN p_bank_ref IS NOT NULL THEN ' · Extrato: ' || p_bank_ref ELSE '' END ||
                            ' · Taxa: ' || v_actual_fee::TEXT,
           updated_at     = now()
     WHERE id = v_inst.pending_entry_id;
    v_paid_entry_id := v_inst.pending_entry_id;
  ELSE
    -- Sem entry pending vinculada: cria um novo paid entry
    INSERT INTO financial_entries (
      clinic_id, type, description, amount,
      due_date, payment_date, status, source, category,
      invoice_id, payment_method, issue_date, notes, created_by
    ) VALUES (
      v_clinic, 'receivable',
      'Repasse cartão · ' || COALESCE(v_inst.card_acquirer, 'operadora'),
      v_amount,
      v_settled_date, v_settled_date, 'paid', 'card_acquirer', 'Repasse de cartão',
      v_inst.invoice_id, v_inst.payment_method,
      v_settled_date,
      'Liquidação parcela ' || v_inst.installment_number || '/' || v_inst.total_installments ||
      CASE WHEN p_bank_ref IS NOT NULL THEN ' · Extrato: ' || p_bank_ref ELSE '' END,
      p_settled_by
    )
    RETURNING id INTO v_paid_entry_id;
  END IF;

  UPDATE card_installments
     SET status             = 'settled',
         settled_at         = now(),
         settled_amount     = v_amount,
         settled_by         = p_settled_by,
         settled_entry_id   = v_paid_entry_id,
         fee_amount         = v_actual_fee,
         bank_statement_ref = p_bank_ref,
         updated_at         = now()
   WHERE id = p_installment_id;

  RETURN jsonb_build_object(
    'installment_id',  p_installment_id,
    'settled_amount',  v_amount,
    'fee_amount',      v_actual_fee,
    'paid_entry_id',   v_paid_entry_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_settle_card_installment(UUID, UUID, NUMERIC, TEXT, NUMERIC, DATE) TO authenticated;

-- ─── 6) RPC: rpc_cancel_card_installment ──────────────────────────────────

CREATE OR REPLACE FUNCTION rpc_cancel_card_installment(
  p_installment_id UUID,
  p_cancelled_by   UUID,
  p_reason         TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst  RECORD;
  v_role  TEXT;
  v_clin  UUID;
BEGIN
  SELECT role, clinic_id INTO v_role, v_clin FROM profiles WHERE id = p_cancelled_by;
  IF v_role NOT IN ('admin','owner','manager') THEN
    RAISE EXCEPTION 'Apenas gestores podem cancelar parcelas.';
  END IF;

  SELECT * INTO v_inst FROM card_installments
   WHERE id = p_installment_id AND clinic_id = v_clin
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;
  IF v_inst.status <> 'pending' THEN
    RAISE EXCEPTION 'Apenas pending pode ser cancelada.';
  END IF;

  UPDATE card_installments
     SET status     = 'cancelled',
         notes      = COALESCE(notes,'') || ' · CANCELADO: ' || p_reason,
         updated_at = now()
   WHERE id = p_installment_id;

  IF v_inst.pending_entry_id IS NOT NULL THEN
    UPDATE financial_entries SET status='cancelled', updated_at=now()
     WHERE id = v_inst.pending_entry_id;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_cancel_card_installment(UUID, UUID, TEXT) TO authenticated;

COMMIT;
