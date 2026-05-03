-- =============================================================================
-- VetMax — Migration 0053: stock_items
-- Tabela esperada pelos testes E2E de Farmácia (pharmacy-module.spec.ts)
-- Os testes usam `stock_items` (não `pharmacy_stock`) — este alias garante
-- que o schema cache do Supabase responda ao nome correto.
-- =============================================================================

CREATE TABLE IF NOT EXISTS stock_items (
  id            uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name          text            NOT NULL,
  category      text            NOT NULL DEFAULT 'medication'
                                CHECK (category IN ('medication', 'supply', 'grooming_supply', 'other')),
  quantity      numeric(10, 3)  NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit          text            NOT NULL DEFAULT 'un',
  min_quantity  numeric(10, 3)  NOT NULL DEFAULT 0,
  unit_price    numeric(10, 2)  NOT NULL DEFAULT 0,
  last_restock  timestamptz,
  created_at    timestamptz     NOT NULL DEFAULT now(),
  updated_at    timestamptz     NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name)
);

CREATE INDEX IF NOT EXISTS idx_stock_items_clinic
  ON stock_items(clinic_id);

CREATE INDEX IF NOT EXISTS idx_stock_items_low_stock
  ON stock_items(clinic_id, quantity, min_quantity)
  WHERE quantity <= min_quantity;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_stock_items_updated_at ON stock_items;
CREATE TRIGGER trg_stock_items_updated_at
  BEFORE UPDATE ON stock_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_stock_items" ON stock_items;
CREATE POLICY "clinic_isolation_stock_items"
  ON stock_items FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());
