-- =============================================================================
-- VetMax — Migration 0095: Módulo Vendas / PDV (G-06)
--
-- Novas tabelas: sales, sale_items
-- Trigger: decrementa stock_items.quantity ao inserir sale_item
-- RPC: rpc_create_sale — cria venda + itens + lança no central_cashier
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Tabela sales
-- =========================================================================

CREATE TABLE IF NOT EXISTS sales (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         UUID          NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  seller_id         UUID          REFERENCES profiles(id),
  tutor_id          UUID          REFERENCES tutors(id),
  consultation_id   UUID          REFERENCES consultations(id),
  total_amount      NUMERIC(10,2) NOT NULL DEFAULT 0 CONSTRAINT sales_total_non_negative CHECK (total_amount >= 0),
  discount_amount   NUMERIC(10,2) NOT NULL DEFAULT 0 CONSTRAINT sales_discount_non_negative CHECK (discount_amount >= 0),
  payment_method    TEXT          NOT NULL DEFAULT 'cash',
  payment_status    TEXT          NOT NULL DEFAULT 'paid',
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      UUID          REFERENCES profiles(id),
  cancellation_reason TEXT,

  CONSTRAINT sales_payment_method_check
    CHECK (payment_method IN ('cash','credit','debit','pix','convenio','other')),

  CONSTRAINT sales_payment_status_check
    CHECK (payment_status IN ('pending','paid','cancelled'))
);

COMMENT ON TABLE  sales                    IS 'Vendas avulsas do PDV — multi-tenant';
COMMENT ON COLUMN sales.total_amount       IS 'Total final após desconto global';
COMMENT ON COLUMN sales.discount_amount    IS 'Desconto global aplicado sobre subtotal dos itens';
COMMENT ON COLUMN sales.payment_method     IS 'cash|credit|debit|pix|convenio|other';
COMMENT ON COLUMN sales.cancelled_at       IS 'Soft delete — venda cancelada sem reversão de estoque automática';

CREATE INDEX IF NOT EXISTS idx_sales_clinic_date
  ON sales (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_clinic_tutor
  ON sales (clinic_id, tutor_id)
  WHERE tutor_id IS NOT NULL;

-- =========================================================================
-- 2. Tabela sale_items
-- =========================================================================

CREATE TABLE IF NOT EXISTS sale_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID          NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  clinic_id       UUID          NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  stock_item_id   UUID          REFERENCES stock_items(id),
  description     TEXT          NOT NULL,
  quantity        NUMERIC(10,3) NOT NULL DEFAULT 1 CONSTRAINT sale_items_qty_positive CHECK (quantity > 0),
  unit_price      NUMERIC(10,2) NOT NULL DEFAULT 0 CONSTRAINT sale_items_price_non_negative CHECK (unit_price >= 0),
  discount        NUMERIC(10,2) NOT NULL DEFAULT 0 CONSTRAINT sale_items_discount_non_negative CHECK (discount >= 0)
);

COMMENT ON TABLE  sale_items               IS 'Itens de cada venda do PDV';
COMMENT ON COLUMN sale_items.stock_item_id IS 'FK para stock_items — NULL em itens manuais sem produto cadastrado';
COMMENT ON COLUMN sale_items.description   IS 'Nome do produto/serviço — desnormalizado para histórico imutável';

CREATE INDEX IF NOT EXISTS idx_sale_items_sale
  ON sale_items (sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_stock_item
  ON sale_items (clinic_id, stock_item_id)
  WHERE stock_item_id IS NOT NULL;

-- =========================================================================
-- 3. RLS: sales
-- =========================================================================

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_clinic_isolation" ON sales;
CREATE POLICY "sales_clinic_isolation"
  ON sales FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- =========================================================================
-- 4. RLS: sale_items
-- =========================================================================

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_items_clinic_isolation" ON sale_items;
CREATE POLICY "sale_items_clinic_isolation"
  ON sale_items FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- =========================================================================
-- 5. Trigger: decrementa stock_items.quantity ao inserir sale_item
--    Apenas quando stock_item_id está preenchido e quantity IS NOT NULL.
--    Não bloqueia venda se estoque insuficiente — apenas decrementa (pode ficar negativo).
-- =========================================================================

CREATE OR REPLACE FUNCTION fn_decrement_stock_on_sale_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.stock_item_id IS NOT NULL THEN
    UPDATE stock_items
    SET quantity   = quantity - NEW.quantity,
        updated_at = now()
    WHERE id = NEW.stock_item_id
      AND quantity IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_item_decrement_stock ON sale_items;
CREATE TRIGGER trg_sale_item_decrement_stock
  AFTER INSERT ON sale_items
  FOR EACH ROW EXECUTE FUNCTION fn_decrement_stock_on_sale_item();

-- =========================================================================
-- 6. RPC rpc_create_sale
--    Cria sale + sale_items + lança em central_cashier em uma transação.
--    p_items: JSONB array de { stock_item_id?, description, quantity, unit_price, discount? }
-- =========================================================================

CREATE OR REPLACE FUNCTION rpc_create_sale(
  p_clinic_id       UUID,
  p_items           JSONB,
  p_payment_method  TEXT    DEFAULT 'cash',
  p_discount_amount NUMERIC DEFAULT 0,
  p_tutor_id        UUID    DEFAULT NULL,
  p_consultation_id UUID    DEFAULT NULL,
  p_notes           TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_user_role  TEXT;
  v_clinic_id  UUID;
  v_sale_id    UUID;
  v_subtotal   NUMERIC := 0;
  v_total      NUMERIC;
  v_item       JSONB;
  v_item_total NUMERIC;
  v_tutor_name TEXT    := NULL;
BEGIN
  -- Autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Autorização: verifica clinic_id do caller
  SELECT role, clinic_id INTO v_user_role, v_clinic_id
  FROM profiles WHERE id = v_user_id;

  IF v_clinic_id IS NULL OR v_clinic_id != p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido';
  END IF;

  IF v_user_role NOT IN ('admin','owner','manager','receptionist','assistant') THEN
    RAISE EXCEPTION 'Permissão insuficiente para registrar venda';
  END IF;

  -- Valida forma de pagamento
  IF p_payment_method NOT IN ('cash','credit','debit','pix','convenio','other') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida: %', p_payment_method;
  END IF;

  -- Calcula subtotal dos itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_total :=
      (v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC
      - COALESCE((v_item->>'discount')::NUMERIC, 0);
    v_subtotal := v_subtotal + v_item_total;
  END LOOP;

  v_total := GREATEST(v_subtotal - COALESCE(p_discount_amount, 0), 0);

  -- Busca nome do tutor (desnormalizado para cashier)
  IF p_tutor_id IS NOT NULL THEN
    SELECT name INTO v_tutor_name FROM tutors WHERE id = p_tutor_id LIMIT 1;
  END IF;

  -- Insere venda
  INSERT INTO sales (
    clinic_id, seller_id, tutor_id, consultation_id,
    total_amount, discount_amount, payment_method, payment_status, notes
  ) VALUES (
    p_clinic_id, v_user_id, p_tutor_id, p_consultation_id,
    v_total, COALESCE(p_discount_amount, 0), p_payment_method, 'paid', p_notes
  ) RETURNING id INTO v_sale_id;

  -- Insere itens (trigger decrementa estoque automaticamente)
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

  -- Lança no caixa central
  INSERT INTO central_cashier (
    clinic_id, source_module, source_id, amount,
    payment_method, status, recorded_by, tutor_name
  ) VALUES (
    p_clinic_id, 'sales', v_sale_id, v_total,
    p_payment_method, 'recorded', v_user_id, v_tutor_name
  );

  RETURN jsonb_build_object(
    'id',    v_sale_id,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_sale TO authenticated;

-- =========================================================================
-- 7. RPC rpc_cancel_sale — soft delete sem reversão de estoque
-- =========================================================================

CREATE OR REPLACE FUNCTION rpc_cancel_sale(
  p_sale_id UUID,
  p_reason  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_user_role TEXT;
  v_clinic_id UUID;
  v_sale_clinic UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT role, clinic_id INTO v_user_role, v_clinic_id FROM profiles WHERE id = v_user_id;

  IF v_user_role NOT IN ('admin','owner','manager') THEN
    RAISE EXCEPTION 'Apenas admin/manager pode cancelar vendas';
  END IF;

  SELECT clinic_id INTO v_sale_clinic FROM sales WHERE id = p_sale_id;
  IF v_sale_clinic IS NULL OR v_sale_clinic != v_clinic_id THEN
    RAISE EXCEPTION 'Venda não encontrada ou acesso negado';
  END IF;

  UPDATE sales SET
    payment_status      = 'cancelled',
    cancelled_at        = now(),
    cancelled_by        = v_user_id,
    cancellation_reason = p_reason
  WHERE id = p_sale_id;

  -- Estorna no caixa (valor negativo)
  UPDATE central_cashier SET status = 'reversed'
  WHERE source_module = 'sales' AND source_id = p_sale_id;

  RETURN jsonb_build_object('cancelled', true, 'sale_id', p_sale_id);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_cancel_sale TO authenticated;

COMMIT;
