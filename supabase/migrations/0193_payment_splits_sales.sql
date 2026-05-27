-- =============================================================================
-- VetMax — Migration 0193: splits/parcelas para vendas PDV
--
-- Permite que vendas avulsas (sales) também tenham splits + card_installments,
-- usando o mesmo fluxo das invoices.
--
-- - invoice_payment_splits.invoice_id passa a aceitar NULL quando sale_id presente
-- - invoice_payment_splits ganha sale_id FK
-- - card_installments.split_id também NULLABLE (caso queiramos criar parcelas
--   diretamente para sales sem split intermediário)
-- - card_installments.sale_id ganha FK
-- - RPC rpc_record_sale_card_splits: variante para PDV
-- =============================================================================

BEGIN;

-- ─── 1) invoice_payment_splits: aceita sale_id alternativo ─────────────────

ALTER TABLE invoice_payment_splits
  ALTER COLUMN invoice_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE CASCADE;

ALTER TABLE invoice_payment_splits
  DROP CONSTRAINT IF EXISTS invoice_payment_splits_source_check;

ALTER TABLE invoice_payment_splits
  ADD CONSTRAINT invoice_payment_splits_source_check
  CHECK (invoice_id IS NOT NULL OR sale_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_splits_sale
  ON invoice_payment_splits (clinic_id, sale_id)
  WHERE sale_id IS NOT NULL;

-- ─── 2) card_installments: split_id NULLABLE; sale_id ganha FK ─────────────

ALTER TABLE card_installments
  ALTER COLUMN split_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS sale_id_fk UUID REFERENCES sales(id) ON DELETE SET NULL;

UPDATE card_installments
   SET sale_id_fk = sale_id::UUID
 WHERE sale_id IS NOT NULL AND sale_id_fk IS NULL;

ALTER TABLE card_installments DROP COLUMN IF EXISTS sale_id;
ALTER TABLE card_installments RENAME COLUMN sale_id_fk TO sale_id;

CREATE INDEX IF NOT EXISTS idx_card_installments_sale
  ON card_installments (clinic_id, sale_id)
  WHERE sale_id IS NOT NULL;

-- ─── 3) RPC: rpc_record_sale_card_splits ──────────────────────────────────
-- Cria invoice_payment_splits + card_installments para uma sale (PDV).
-- A venda já foi criada via rpc_create_sale (com payment_method principal).
-- Esta RPC adiciona o detalhamento de cada split e gera as parcelas pendentes
-- de cartão. O central_cashier já foi atualizado pelo createSale (action TS).

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

    IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

    v_is_card := v_method IN ('credit', 'debit', 'voucher');

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

    INSERT INTO invoice_payment_splits (
      clinic_id, invoice_id, sale_id, financial_entry_id, amount,
      payment_method, payment_card_id, installments,
      card_acquirer, card_brand, card_nsu, card_authorization,
      effective_date, created_by
    ) VALUES (
      p_clinic_id, NULL, p_sale_id, NULL, v_amount,
      v_method, v_card_id, v_installments,
      v_card_acq, v_card_brand, v_nsu, v_auth,
      CURRENT_DATE, p_recorded_by
    )
    RETURNING id INTO v_split_id;

    IF v_is_card THEN
      v_per_install_grs := ROUND(v_amount / v_installments, 2);

      FOR v_inst_num IN 1..v_installments LOOP
        IF v_method = 'debit' OR v_method = 'voucher' THEN
          v_inst_date := CURRENT_DATE + v_settlement_days;
        ELSE
          v_inst_date := CURRENT_DATE + (v_settlement_days * v_inst_num);
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
          CURRENT_DATE,
          CASE WHEN v_nsu IS NOT NULL THEN 'NSU ' || v_nsu || COALESCE(' · Lib ' || v_auth, '') ELSE NULL END,
          p_recorded_by
        )
        RETURNING id INTO v_entry_id;

        INSERT INTO card_installments (
          clinic_id, split_id, invoice_id, sale_id, payment_card_id,
          installment_number, total_installments,
          payment_method, card_acquirer, card_brand, card_nsu, card_authorization,
          gross_amount, fee_percent, fee_amount, net_amount,
          expected_settlement_date, status, pending_entry_id
        ) VALUES (
          p_clinic_id, v_split_id, NULL, p_sale_id, v_card_id,
          v_inst_num, v_installments,
          v_method, v_card_acq, v_card_brand, v_nsu, v_auth,
          v_per_install_grs, v_fee_pct, v_per_install_fee, v_per_install_net,
          v_inst_date, 'pending', v_entry_id
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
