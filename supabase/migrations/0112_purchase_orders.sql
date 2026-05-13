-- Tabelas para o Módulo de Compras (NF-e import + entrada manual)

CREATE TABLE IF NOT EXISTS purchase_orders (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  supplier_id      UUID        REFERENCES suppliers(id) ON DELETE SET NULL,
  nfe_key          TEXT,
  nfe_number       TEXT,
  nfe_series       TEXT,
  issue_date       DATE,
  total_value      NUMERIC(12,2),
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','received','cancelled')),
  xml_content      TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_clinic ON purchase_orders (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_nfe_key ON purchase_orders (nfe_key) WHERE nfe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   UUID        NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  stock_item_id       UUID        REFERENCES stock_items(id) ON DELETE SET NULL,
  description         TEXT        NOT NULL,
  ncm                 TEXT,
  ean                 TEXT,
  cfop                TEXT,
  quantity            NUMERIC(10,3) NOT NULL,
  unit                TEXT,
  unit_price          NUMERIC(10,4) NOT NULL,
  total_price         NUMERIC(12,2) NOT NULL,
  tax_icms            NUMERIC(5,2),
  tax_pis             NUMERIC(5,4),
  tax_cofins          NUMERIC(5,4),
  is_matched          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_stock ON purchase_order_items (stock_item_id) WHERE stock_item_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_purchase_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_purchase_orders_updated_at();

-- RLS
ALTER TABLE purchase_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_staff_view_purchase_orders" ON purchase_orders;
CREATE POLICY "clinic_staff_view_purchase_orders"
  ON purchase_orders FOR SELECT
  USING (clinic_id = get_user_clinic_id());

DROP POLICY IF EXISTS "managers_manage_purchase_orders" ON purchase_orders;
CREATE POLICY "managers_manage_purchase_orders"
  ON purchase_orders FOR ALL
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

DROP POLICY IF EXISTS "clinic_staff_view_purchase_order_items" ON purchase_order_items;
CREATE POLICY "clinic_staff_view_purchase_order_items"
  ON purchase_order_items FOR SELECT
  USING (
    purchase_order_id IN (
      SELECT id FROM purchase_orders WHERE clinic_id = get_user_clinic_id()
    )
  );

DROP POLICY IF EXISTS "managers_manage_purchase_order_items" ON purchase_order_items;
CREATE POLICY "managers_manage_purchase_order_items"
  ON purchase_order_items FOR ALL
  USING (
    purchase_order_id IN (
      SELECT id FROM purchase_orders WHERE clinic_id = get_user_clinic_id()
    )
  );
