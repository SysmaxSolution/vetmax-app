-- =============================================================================
-- VetMax — Migration 0191: Cards registry, split payments e lançamentos manuais
--
-- Suporta toda a lógica de Caixa expandido:
--   1. clinic_payment_cards: cadastro de cartões/maquininhas (Financeiro >
--      Cadastros > Cartões). Operadora, tipo (credit/debit/voucher), bandeira,
--      taxas e dias de repasse para conciliação posterior.
--
--   2. invoice_payment_splits: representa cada parcela/método de pagamento que
--      compõe a baixa de uma invoice (ex.: R$ 150 = R$ 100 cartão + R$ 50 pix).
--      Vinculado a financial_entries.id quando há entrada de caixa, e contém
--      detalhes do cartão para conciliação.
--
--   3. Extensão de central_cashier:
--      - patient_name já existe (0052); só preenchemos via gatilhos para PDV.
--      - effective_date NULL → usa created_at; permite edição retroativa.
--      - amount constraint passa a aceitar 0 para suprimentos zerados? Não, mantém.
--      - source_module adiciona 'manual_inflow' para suprimento/troco-entrada.
--
--   4. Extensão de cashier_outflows: adiciona 'troco' e 'suprimento' (este só
--      em casos onde a categoria é simétrica com troco devolvido). Suprimento
--      vai em central_cashier (entrada), troco em outflow (saída).
--
--   5. sales.patient_id: campo opcional para vincular venda PDV a um pet.
--      Propaga para central_cashier.patient_name quando informado.
-- =============================================================================

BEGIN;

-- ─── 1) clinic_payment_cards ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinic_payment_cards (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  label           TEXT         NOT NULL,
  acquirer        TEXT         NOT NULL,
  card_type       TEXT         NOT NULL,
  brand           TEXT         NULL,
  fee_percent     NUMERIC(5,2) NOT NULL DEFAULT 0 CONSTRAINT clinic_payment_cards_fee_check CHECK (fee_percent >= 0 AND fee_percent <= 100),
  settlement_days INT          NOT NULL DEFAULT 1 CONSTRAINT clinic_payment_cards_settle_check CHECK (settlement_days >= 0 AND settlement_days <= 365),
  max_installments INT         NOT NULL DEFAULT 1 CONSTRAINT clinic_payment_cards_install_check CHECK (max_installments BETWEEN 1 AND 24),
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  notes           TEXT         NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by      UUID         REFERENCES profiles(id),

  CONSTRAINT clinic_payment_cards_type_check
    CHECK (card_type IN ('credit','debit','voucher','other'))
);

COMMENT ON TABLE  clinic_payment_cards IS 'Cadastro de cartões/maquininhas da clínica para conciliação financeira.';
COMMENT ON COLUMN clinic_payment_cards.label           IS 'Nome amigável do cartão/maquininha (ex.: "Cielo Mesa 1").';
COMMENT ON COLUMN clinic_payment_cards.acquirer        IS 'Operadora (Cielo, Stone, Rede, GetNet, ...).';
COMMENT ON COLUMN clinic_payment_cards.card_type       IS 'credit | debit | voucher | other';
COMMENT ON COLUMN clinic_payment_cards.brand           IS 'Bandeira (Visa, Mastercard, Elo, Amex, ...) — opcional.';
COMMENT ON COLUMN clinic_payment_cards.fee_percent     IS 'Percentual de taxa cobrado pela operadora (para cálculo de líquido).';
COMMENT ON COLUMN clinic_payment_cards.settlement_days IS 'Prazo padrão de repasse (D+N) em dias úteis.';
COMMENT ON COLUMN clinic_payment_cards.max_installments IS 'Quantidade máxima de parcelas permitidas (1 = à vista).';

CREATE INDEX IF NOT EXISTS idx_clinic_payment_cards_clinic
  ON clinic_payment_cards (clinic_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_clinic_payment_cards_clinic_label
  ON clinic_payment_cards (clinic_id, lower(label))
  WHERE is_active = true;

-- RLS
ALTER TABLE clinic_payment_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_payment_cards_select" ON clinic_payment_cards;
CREATE POLICY "clinic_payment_cards_select"
  ON clinic_payment_cards FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "clinic_payment_cards_insert" ON clinic_payment_cards;
CREATE POLICY "clinic_payment_cards_insert"
  ON clinic_payment_cards FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner','manager','accountant','receptionist')
  );

DROP POLICY IF EXISTS "clinic_payment_cards_update" ON clinic_payment_cards;
CREATE POLICY "clinic_payment_cards_update"
  ON clinic_payment_cards FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner','manager','accountant')
  );

DROP POLICY IF EXISTS "clinic_payment_cards_delete" ON clinic_payment_cards;
CREATE POLICY "clinic_payment_cards_delete"
  ON clinic_payment_cards FOR DELETE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner')
  );

-- ─── 2) invoice_payment_splits ──────────────────────────────────────────────
-- Quando uma fatura é paga em múltiplos métodos (ex.: parte cartão, parte pix),
-- cada parcela é uma linha aqui, vinculada ao financial_entry da baixa caso o
-- método movimente caixa. Permite múltiplas baixas no mesmo dia e mantém o
-- detalhamento granular para conciliação.

CREATE TABLE IF NOT EXISTS invoice_payment_splits (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  invoice_id          UUID         NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  financial_entry_id  UUID         NULL REFERENCES financial_entries(id) ON DELETE SET NULL,
  amount              NUMERIC(12,2) NOT NULL CONSTRAINT invoice_payment_splits_amount_positive CHECK (amount > 0),
  payment_method      TEXT         NOT NULL,
  payment_card_id     UUID         NULL REFERENCES clinic_payment_cards(id) ON DELETE SET NULL,
  installments        INT          NOT NULL DEFAULT 1 CONSTRAINT invoice_payment_splits_install_check CHECK (installments >= 1 AND installments <= 24),
  card_acquirer       TEXT         NULL,
  card_brand          TEXT         NULL,
  card_nsu            TEXT         NULL,
  card_authorization  TEXT         NULL,
  paid_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  effective_date      DATE         NOT NULL DEFAULT CURRENT_DATE,
  notes               TEXT         NULL,
  created_by          UUID         REFERENCES profiles(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT invoice_payment_splits_method_check
    CHECK (payment_method IN ('pix','credit','debit','cash','voucher','convenio','transfer','other'))
);

COMMENT ON TABLE  invoice_payment_splits IS 'Cada parcela/método de pagamento que compõe a baixa de uma invoice (split payment).';
COMMENT ON COLUMN invoice_payment_splits.effective_date    IS 'Data efetiva contábil — pode ser retroativa (ex.: pagamento recebido em data anterior).';
COMMENT ON COLUMN invoice_payment_splits.payment_card_id   IS 'Quando credit/debit, FK opcional para o cartão da clínica que processou.';
COMMENT ON COLUMN invoice_payment_splits.card_nsu          IS 'NSU emitido pela maquininha — chave de conciliação.';
COMMENT ON COLUMN invoice_payment_splits.card_authorization IS 'Número de liberação/autorização da bandeira.';

CREATE INDEX IF NOT EXISTS idx_invoice_payment_splits_invoice
  ON invoice_payment_splits (clinic_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_splits_card
  ON invoice_payment_splits (clinic_id, payment_card_id)
  WHERE payment_card_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_payment_splits_date
  ON invoice_payment_splits (clinic_id, effective_date DESC);

-- RLS
ALTER TABLE invoice_payment_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_payment_splits_select" ON invoice_payment_splits;
CREATE POLICY "invoice_payment_splits_select"
  ON invoice_payment_splits FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "invoice_payment_splits_insert" ON invoice_payment_splits;
CREATE POLICY "invoice_payment_splits_insert"
  ON invoice_payment_splits FOR INSERT
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "invoice_payment_splits_update" ON invoice_payment_splits;
CREATE POLICY "invoice_payment_splits_update"
  ON invoice_payment_splits FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner','manager','accountant')
  );

DROP POLICY IF EXISTS "invoice_payment_splits_delete" ON invoice_payment_splits;
CREATE POLICY "invoice_payment_splits_delete"
  ON invoice_payment_splits FOR DELETE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner','manager')
  );

-- ─── 3) Extensão de central_cashier ─────────────────────────────────────────
-- Adiciona effective_date (data contábil — permite retroativa) e patient_name
-- já existe. Estende source_module para 'manual_inflow'.

ALTER TABLE central_cashier
  ADD COLUMN IF NOT EXISTS effective_date DATE NULL,
  ADD COLUMN IF NOT EXISTS payment_card_id UUID NULL REFERENCES clinic_payment_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_nsu TEXT NULL,
  ADD COLUMN IF NOT EXISTS card_authorization TEXT NULL,
  ADD COLUMN IF NOT EXISTS card_installments INT NULL CONSTRAINT central_cashier_installments_check CHECK (card_installments IS NULL OR (card_installments BETWEEN 1 AND 24));

COMMENT ON COLUMN central_cashier.effective_date     IS 'Data contábil efetiva — quando NULL, usa created_at. Permite lançar pagamento retroativo.';
COMMENT ON COLUMN central_cashier.payment_card_id    IS 'Quando credit/debit, FK opcional para o cartão usado (Financeiro > Cadastros > Cartões).';
COMMENT ON COLUMN central_cashier.card_nsu           IS 'NSU emitido pela maquininha — chave de conciliação.';
COMMENT ON COLUMN central_cashier.card_authorization IS 'Número de autorização emitido pela bandeira.';
COMMENT ON COLUMN central_cashier.card_installments  IS 'Quantidade de parcelas (apenas crédito) — NULL para outros métodos.';

CREATE INDEX IF NOT EXISTS idx_central_cashier_effective_date
  ON central_cashier (clinic_id, effective_date DESC NULLS LAST)
  WHERE effective_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_central_cashier_payment_card
  ON central_cashier (clinic_id, payment_card_id)
  WHERE payment_card_id IS NOT NULL;

-- ─── 4) Extensão de cashier_outflows: novas categorias ──────────────────────
-- Adiciona 'troco' (troco devolvido) e mantém compat com sangria/despesa.

DO $$
BEGIN
  ALTER TABLE cashier_outflows DROP CONSTRAINT IF EXISTS cashier_outflows_category_check;
  ALTER TABLE cashier_outflows ADD CONSTRAINT cashier_outflows_category_check
    CHECK (category IN ('sangria','despesa_operacional','fornecedor','estorno','troco','other'));
EXCEPTION WHEN undefined_table THEN
  NULL;
END$$;

-- ─── 5) sales.patient_id (PDV vinculado a pet opcional) ─────────────────────

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS patient_id UUID NULL REFERENCES patients(id) ON DELETE SET NULL;

COMMENT ON COLUMN sales.patient_id IS 'Pet opcionalmente vinculado à venda PDV — propaga para central_cashier.patient_name.';

CREATE INDEX IF NOT EXISTS idx_sales_clinic_patient
  ON sales (clinic_id, patient_id)
  WHERE patient_id IS NOT NULL;

-- ─── 6) Atualização do rpc_create_sale: aceita p_patient_id e propaga nome ──

CREATE OR REPLACE FUNCTION rpc_create_sale(
  p_clinic_id       UUID,
  p_items           JSONB,
  p_payment_method  TEXT    DEFAULT 'cash',
  p_discount_amount NUMERIC DEFAULT 0,
  p_tutor_id        UUID    DEFAULT NULL,
  p_consultation_id UUID    DEFAULT NULL,
  p_notes           TEXT    DEFAULT NULL,
  p_patient_id      UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_user_role    TEXT;
  v_clinic_id    UUID;
  v_sale_id      UUID;
  v_subtotal     NUMERIC := 0;
  v_total        NUMERIC;
  v_item         JSONB;
  v_item_total   NUMERIC;
  v_tutor_name   TEXT    := NULL;
  v_patient_name TEXT    := NULL;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT role, clinic_id INTO v_user_role, v_clinic_id
  FROM profiles WHERE id = v_user_id;

  IF v_clinic_id IS NULL OR v_clinic_id != p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido';
  END IF;

  IF v_user_role NOT IN ('admin','owner','manager','receptionist','assistant') THEN
    RAISE EXCEPTION 'Permissão insuficiente para registrar venda';
  END IF;

  IF p_payment_method NOT IN ('cash','credit','debit','pix','convenio','other') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida: %', p_payment_method;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_total :=
      (v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC
      - COALESCE((v_item->>'discount')::NUMERIC, 0);
    v_subtotal := v_subtotal + v_item_total;
  END LOOP;

  v_total := GREATEST(v_subtotal - COALESCE(p_discount_amount, 0), 0);

  IF p_tutor_id IS NOT NULL THEN
    SELECT name INTO v_tutor_name FROM tutors WHERE id = p_tutor_id LIMIT 1;
  END IF;

  IF p_patient_id IS NOT NULL THEN
    SELECT name INTO v_patient_name FROM patients WHERE id = p_patient_id LIMIT 1;
    IF v_tutor_name IS NULL THEN
      SELECT t.name INTO v_tutor_name
        FROM patients p
        LEFT JOIN tutors t ON t.id = p.tutor_id
       WHERE p.id = p_patient_id
       LIMIT 1;
    END IF;
  END IF;

  INSERT INTO sales (
    clinic_id, seller_id, tutor_id, consultation_id, patient_id,
    total_amount, discount_amount, payment_method, payment_status, notes
  ) VALUES (
    p_clinic_id, v_user_id, p_tutor_id, p_consultation_id, p_patient_id,
    v_total, COALESCE(p_discount_amount, 0), p_payment_method, 'paid', p_notes
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO sale_items (
      sale_id, clinic_id, stock_item_id, description, quantity, unit_price, discount
    ) VALUES (
      v_sale_id,
      p_clinic_id,
      CASE WHEN (v_item->>'stock_item_id') IS NOT NULL AND (v_item->>'stock_item_id') != ''
           THEN (v_item->>'stock_item_id')::UUID
           ELSE NULL
      END,
      v_item->>'description',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE((v_item->>'discount')::NUMERIC, 0)
    );
  END LOOP;

  INSERT INTO central_cashier (
    clinic_id, source_module, source_id, amount,
    payment_method, status, recorded_by,
    tutor_name, patient_name, reason
  ) VALUES (
    p_clinic_id, 'sales', v_sale_id, v_total,
    p_payment_method, 'recorded', v_user_id,
    v_tutor_name, v_patient_name,
    COALESCE('Venda PDV — ' || v_patient_name, 'Venda PDV')
  );

  RETURN jsonb_build_object(
    'id',    v_sale_id,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_sale(UUID, JSONB, TEXT, NUMERIC, UUID, UUID, TEXT, UUID) TO authenticated;

-- ─── 7) RPC: recordSplitPayment — registra múltiplos métodos em uma baixa ──
-- Aplica N splits sobre uma invoice. Cada split vira:
--   - invoice_payment_splits (sempre, para conciliação)
--   - financial_entry paid source='cashier' (para somar no caixa)
--   - central_cashier registro recorded (uma linha por split, ou um único
--     registro consolidado quando split.length == 1)
--
-- Atualiza invoice.paid_amount/status no final.

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

    -- Cria financial_entry paid (somente para métodos que entram em caixa).
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
      v_eff_date,
      CASE WHEN v_method IN ('credit','debit') AND v_nsu IS NOT NULL
           THEN 'NSU ' || v_nsu || COALESCE(' · Liberação ' || v_auth, '')
           ELSE NULL END,
      p_recorded_by
    )
    RETURNING id INTO v_entry_id;

    -- Registra split detalhado
    INSERT INTO invoice_payment_splits (
      clinic_id, invoice_id, financial_entry_id, amount,
      payment_method, payment_card_id, installments,
      card_acquirer, card_brand, card_nsu, card_authorization,
      effective_date, created_by
    ) VALUES (
      p_clinic_id, p_invoice_id, v_entry_id, v_amount,
      v_method, v_card_id, v_installments,
      v_card_acq, v_card_brand, v_nsu, v_auth,
      v_eff_date, p_recorded_by
    )
    RETURNING id INTO v_split_id;

    -- Lança no central_cashier
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

  -- Atualiza a invoice
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

  -- Apaga pending source='cashier' antigo caso saldo tenha zerado
  IF v_new_status = 'paid' THEN
    DELETE FROM financial_entries
     WHERE clinic_id  = p_clinic_id
       AND invoice_id = p_invoice_id
       AND status     = 'pending'
       AND source     = 'cashier';
  ELSE
    -- Atualiza/Cria pending com saldo restante
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

-- ─── 8) RPC: rpc_record_manual_inflow — Suprimento/Troco-entrada no caixa ──

CREATE OR REPLACE FUNCTION rpc_record_manual_inflow(
  p_clinic_id    UUID,
  p_amount       NUMERIC,
  p_reason       TEXT,
  p_recorded_by  UUID,
  p_payment_method TEXT DEFAULT 'cash',
  p_effective_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   UUID;
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles
   WHERE id = p_recorded_by AND clinic_id = p_clinic_id;

  IF v_role NOT IN ('admin','owner','manager','accountant','receptionist') THEN
    RAISE EXCEPTION 'Permissão insuficiente para lançar entrada manual';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  INSERT INTO central_cashier (
    clinic_id, source_module, amount, status,
    payment_method, reason, recorded_by, effective_date
  ) VALUES (
    p_clinic_id, 'manual', p_amount, 'recorded',
    p_payment_method, COALESCE(p_reason, 'Entrada manual'),
    p_recorded_by, COALESCE(p_effective_date, CURRENT_DATE)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_manual_inflow(UUID, NUMERIC, TEXT, UUID, TEXT, DATE) TO authenticated;

-- ─── 9) RPC: rpc_update_cashier_effective_date — edita data retroativa ─────

CREATE OR REPLACE FUNCTION rpc_update_cashier_effective_date(
  p_entry_id      UUID,
  p_effective_date DATE,
  p_updated_by    UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      TEXT;
  v_clinic    UUID;
  v_entry_clin UUID;
BEGIN
  SELECT role, clinic_id INTO v_role, v_clinic FROM profiles WHERE id = p_updated_by;

  IF v_role NOT IN ('admin','owner','manager','accountant') THEN
    RAISE EXCEPTION 'Apenas gestores podem editar data retroativa.';
  END IF;

  SELECT clinic_id INTO v_entry_clin FROM central_cashier WHERE id = p_entry_id;
  IF v_entry_clin IS NULL OR v_entry_clin <> v_clinic THEN
    RAISE EXCEPTION 'Lançamento não encontrado.';
  END IF;

  IF p_effective_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Data efetiva não pode ser futura.';
  END IF;

  UPDATE central_cashier
     SET effective_date = p_effective_date
   WHERE id = p_entry_id;

  -- Sincroniza financial_entries (payment_date e issue_date) se vinculado
  UPDATE financial_entries
     SET payment_date = p_effective_date,
         updated_at   = now()
   WHERE cashier_entry_id = p_entry_id
     AND status = 'paid';

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_update_cashier_effective_date(UUID, DATE, UUID) TO authenticated;

-- ─── 10) Atualiza trigger fn_sync_cashier_entry_to_financial para usar
-- effective_date quando presente (data contábil real).

CREATE OR REPLACE FUNCTION fn_sync_cashier_entry_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_effective_date DATE;
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;

  v_effective_date := COALESCE(NEW.effective_date, NEW.created_at::DATE);

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
      v_effective_date,
      CASE WHEN NEW.status = 'pending' THEN NULL ELSE v_effective_date END,
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

COMMIT;
