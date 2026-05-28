-- =============================================================================
-- VetMax — Migration 0194: Unifica cadastro de cartões em credit_cards
--
-- A tabela clinic_payment_cards (criada em 0191) duplicava o cadastro existente
-- em credit_cards (Financeiro > Cadastros > Cartões). Esta migration consolida
-- tudo em credit_cards e atualiza FKs.
--
-- - invoice_payment_splits.payment_card_id → credit_cards.id
-- - central_cashier.payment_card_id        → credit_cards.id
-- - card_installments.payment_card_id      → credit_cards.id
-- - Acrescenta transaction_date a invoice_payment_splits/card_installments
-- - Drop clinic_payment_cards (vazia em produção; em dev pode ter dados de
--   teste descartáveis).
-- =============================================================================

BEGIN;

-- ─── 1) Remove FKs antigas para clinic_payment_cards ──────────────────────

ALTER TABLE IF EXISTS invoice_payment_splits
  DROP CONSTRAINT IF EXISTS invoice_payment_splits_payment_card_id_fkey;

ALTER TABLE IF EXISTS central_cashier
  DROP CONSTRAINT IF EXISTS central_cashier_payment_card_id_fkey;

ALTER TABLE IF EXISTS card_installments
  DROP CONSTRAINT IF EXISTS card_installments_payment_card_id_fkey;

-- ─── 2) Re-cria FKs apontando para credit_cards ───────────────────────────

ALTER TABLE invoice_payment_splits
  ADD CONSTRAINT invoice_payment_splits_payment_card_id_fkey
  FOREIGN KEY (payment_card_id) REFERENCES credit_cards(id) ON DELETE SET NULL;

ALTER TABLE central_cashier
  ADD CONSTRAINT central_cashier_payment_card_id_fkey
  FOREIGN KEY (payment_card_id) REFERENCES credit_cards(id) ON DELETE SET NULL;

ALTER TABLE card_installments
  ADD CONSTRAINT card_installments_payment_card_id_fkey
  FOREIGN KEY (payment_card_id) REFERENCES credit_cards(id) ON DELETE SET NULL;

-- ─── 3) Adiciona transaction_date para registrar quando o cliente passou ──

ALTER TABLE invoice_payment_splits
  ADD COLUMN IF NOT EXISTS transaction_date DATE NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE card_installments
  ADD COLUMN IF NOT EXISTS transaction_date DATE NOT NULL DEFAULT CURRENT_DATE;

COMMENT ON COLUMN invoice_payment_splits.transaction_date IS
  'Data em que o cliente realmente passou o cartão (pode ser anterior ao lançamento).';
COMMENT ON COLUMN card_installments.transaction_date IS
  'Data da transação no terminal — base para cálculo da data prevista de repasse.';

-- ─── 4) Drop clinic_payment_cards ──────────────────────────────────────────
-- Atenção: dados em clinic_payment_cards são descartados. Em produção a tabela
-- está vazia. Em desenvolvimento, qualquer cartão de teste deve ser
-- re-cadastrado em Financeiro > Cadastros > Cartões (credit_cards).

DROP TABLE IF EXISTS clinic_payment_cards CASCADE;

-- ─── 5) RPC rpc_record_split_payment ATUALIZADA ───────────────────────────
-- Lê fee_percent e days_to_receive de credit_cards (em vez de clinic_payment_cards).
-- Aceita p_transaction_date opcional por split (via JSONB).

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
  v_txn_date         DATE;
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
    v_txn_date     := COALESCE(NULLIF(v_split->>'transaction_date', '')::DATE, CURRENT_DATE);

    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Split com valor inválido: %', v_amount;
    END IF;

    IF v_method NOT IN ('pix','credit','debit','cash','voucher','convenio','transfer','other') THEN
      RAISE EXCEPTION 'Método de pagamento inválido: %', v_method;
    END IF;

    v_is_card := v_method IN ('credit', 'debit', 'voucher');

    v_fee_pct         := 0;
    v_settlement_days := CASE WHEN v_method = 'debit' THEN 1 ELSE 30 END;
    IF v_card_id IS NOT NULL THEN
      SELECT fee_percent, days_to_receive, administrator, brand
        INTO v_card_row
        FROM credit_cards WHERE id = v_card_id AND clinic_id = p_clinic_id;
      IF FOUND THEN
        v_fee_pct         := COALESCE(v_card_row.fee_percent, 0);
        v_settlement_days := COALESCE(v_card_row.days_to_receive, v_settlement_days);
        v_card_acq        := COALESCE(v_card_acq, v_card_row.administrator);
        v_card_brand      := COALESCE(v_card_brand, v_card_row.brand);
      END IF;
    END IF;

    INSERT INTO invoice_payment_splits (
      clinic_id, invoice_id, financial_entry_id, amount,
      payment_method, payment_card_id, installments,
      card_acquirer, card_brand, card_nsu, card_authorization,
      effective_date, transaction_date, created_by
    ) VALUES (
      p_clinic_id, p_invoice_id, NULL, v_amount,
      v_method, v_card_id, v_installments,
      v_card_acq, v_card_brand, v_nsu, v_auth,
      v_eff_date, v_txn_date, p_recorded_by
    )
    RETURNING id INTO v_split_id;

    IF v_is_card THEN
      v_per_install_grs := ROUND(v_amount / v_installments, 2);

      FOR v_inst_num IN 1..v_installments LOOP
        IF v_method = 'debit' OR v_method = 'voucher' THEN
          v_inst_date := v_txn_date + v_settlement_days;
        ELSE
          v_inst_date := v_txn_date + (v_settlement_days * v_inst_num);
        END IF;

        IF v_inst_num = v_installments THEN
          v_per_install_grs := v_amount - (v_per_install_grs * (v_installments - 1));
        END IF;

        v_per_install_fee := ROUND(v_per_install_grs * v_fee_pct / 100, 2);
        v_per_install_net := v_per_install_grs - v_per_install_fee;

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
          v_txn_date,
          CASE WHEN v_nsu IS NOT NULL THEN 'NSU ' || v_nsu || COALESCE(' · Lib ' || v_auth, '') ELSE NULL END,
          p_recorded_by
        )
        RETURNING id INTO v_entry_id;

        INSERT INTO card_installments (
          clinic_id, split_id, invoice_id, payment_card_id,
          installment_number, total_installments,
          payment_method, card_acquirer, card_brand, card_nsu, card_authorization,
          gross_amount, fee_percent, fee_amount, net_amount,
          expected_settlement_date, transaction_date, status, pending_entry_id
        ) VALUES (
          p_clinic_id, v_split_id, p_invoice_id, v_card_id,
          v_inst_num, v_installments,
          v_method, v_card_acq, v_card_brand, v_nsu, v_auth,
          v_per_install_grs, v_fee_pct, v_per_install_fee, v_per_install_net,
          v_inst_date, v_txn_date, 'pending', v_entry_id
        );
      END LOOP;

      UPDATE invoice_payment_splits
         SET financial_entry_id = (
           SELECT pending_entry_id FROM card_installments WHERE split_id = v_split_id ORDER BY installment_number LIMIT 1
         )
       WHERE id = v_split_id;

    ELSE
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

-- ─── 6) RPC rpc_record_sale_card_splits ATUALIZADA (PDV) ──────────────────

CREATE OR REPLACE FUNCTION rpc_record_sale_card_splits(
  p_clinic_id    UUID,
  p_sale_id      UUID,
  p_recorded_by  UUID,
  p_patient_name TEXT,
  p_tutor_name   TEXT,
  p_splits       JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_split            JSONB;
  v_amount           NUMERIC;
  v_method           TEXT;
  v_card_id          UUID;
  v_installments     INT;
  v_card_acq         TEXT;
  v_card_brand       TEXT;
  v_nsu              TEXT;
  v_auth             TEXT;
  v_txn_date         DATE;
  v_split_id         UUID;
  v_entry_id         UUID;
  v_card_row         RECORD;
  v_per_install_grs  NUMERIC;
  v_fee_pct          NUMERIC;
  v_settlement_days  INT;
  v_inst_date        DATE;
  v_inst_num         INT;
  v_per_install_fee  NUMERIC;
  v_per_install_net  NUMERIC;
  v_is_card          BOOLEAN;
  v_tutor_id         UUID;
  v_patient_id       UUID;
  v_installments_created INT := 0;
BEGIN
  SELECT tutor_id, patient_id INTO v_tutor_id, v_patient_id
    FROM sales WHERE id = p_sale_id AND clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
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
    v_txn_date     := COALESCE(NULLIF(v_split->>'transaction_date', '')::DATE, CURRENT_DATE);

    IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

    v_is_card := v_method IN ('credit', 'debit', 'voucher')
                  AND v_card_id IS NOT NULL OR v_method IN ('credit', 'debit', 'voucher');

    v_fee_pct         := 0;
    v_settlement_days := CASE WHEN v_method = 'debit' THEN 1 ELSE 30 END;
    IF v_card_id IS NOT NULL THEN
      SELECT fee_percent, days_to_receive, administrator, brand INTO v_card_row
        FROM credit_cards WHERE id = v_card_id AND clinic_id = p_clinic_id;
      IF FOUND THEN
        v_fee_pct         := COALESCE(v_card_row.fee_percent, 0);
        v_settlement_days := COALESCE(v_card_row.days_to_receive, v_settlement_days);
        v_card_acq        := COALESCE(v_card_acq, v_card_row.administrator);
        v_card_brand      := COALESCE(v_card_brand, v_card_row.brand);
      END IF;
    END IF;

    INSERT INTO invoice_payment_splits (
      clinic_id, invoice_id, sale_id, financial_entry_id, amount,
      payment_method, payment_card_id, installments,
      card_acquirer, card_brand, card_nsu, card_authorization,
      effective_date, transaction_date, created_by
    ) VALUES (
      p_clinic_id, NULL, p_sale_id, NULL, v_amount,
      v_method, v_card_id, v_installments,
      v_card_acq, v_card_brand, v_nsu, v_auth,
      v_txn_date, v_txn_date, p_recorded_by
    )
    RETURNING id INTO v_split_id;

    IF v_method IN ('credit', 'debit', 'voucher') THEN
      v_per_install_grs := ROUND(v_amount / v_installments, 2);

      FOR v_inst_num IN 1..v_installments LOOP
        IF v_method = 'debit' OR v_method = 'voucher' THEN
          v_inst_date := v_txn_date + v_settlement_days;
        ELSE
          v_inst_date := v_txn_date + (v_settlement_days * v_inst_num);
        END IF;

        IF v_inst_num = v_installments THEN
          v_per_install_grs := v_amount - (v_per_install_grs * (v_installments - 1));
        END IF;

        v_per_install_fee := ROUND(v_per_install_grs * v_fee_pct / 100, 2);
        v_per_install_net := v_per_install_grs - v_per_install_fee;

        INSERT INTO financial_entries (
          clinic_id, type, description, amount,
          due_date, payment_date, status, source, category,
          tutor_id, patient_id, payment_method,
          issue_date, notes, created_by
        ) VALUES (
          p_clinic_id, 'receivable',
          'Cartão PDV ' || v_method || ' · ' || COALESCE(v_card_acq, 'operadora') || ' · ' || v_inst_num || '/' || v_installments ||
            ' · ' || substring(p_sale_id::TEXT,1,8) || ' · ' || COALESCE(p_patient_name, p_tutor_name, '—'),
          v_per_install_grs,
          v_inst_date, NULL, 'pending', 'card_acquirer', 'A receber de cartão',
          v_tutor_id, v_patient_id, v_method,
          v_txn_date,
          CASE WHEN v_nsu IS NOT NULL THEN 'NSU ' || v_nsu || COALESCE(' · Lib ' || v_auth, '') ELSE NULL END,
          p_recorded_by
        )
        RETURNING id INTO v_entry_id;

        INSERT INTO card_installments (
          clinic_id, split_id, invoice_id, sale_id, payment_card_id,
          installment_number, total_installments,
          payment_method, card_acquirer, card_brand, card_nsu, card_authorization,
          gross_amount, fee_percent, fee_amount, net_amount,
          expected_settlement_date, transaction_date, status, pending_entry_id
        ) VALUES (
          p_clinic_id, v_split_id, NULL, p_sale_id, v_card_id,
          v_inst_num, v_installments,
          v_method, v_card_acq, v_card_brand, v_nsu, v_auth,
          v_per_install_grs, v_fee_pct, v_per_install_fee, v_per_install_net,
          v_inst_date, v_txn_date, 'pending', v_entry_id
        );

        v_installments_created := v_installments_created + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sale_id',               p_sale_id,
    'installments_created',  v_installments_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_sale_card_splits(UUID, UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
