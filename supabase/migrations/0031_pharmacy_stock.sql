-- =============================================================================
-- VetMax — Migration 0031: pharmacy_stock + stock_movements
-- Módulo de Estoque com Abatimento Automático
-- =============================================================================

-- ── Tabela Principal de Estoque ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pharmacy_stock (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  medication_name text            NOT NULL,
  quantity        numeric(10, 3)  NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit            text            NOT NULL DEFAULT 'un',
  min_stock_level numeric(10, 3)  NOT NULL DEFAULT 0,
  last_restock    timestamptz,
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, medication_name)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_clinic
  ON pharmacy_stock(clinic_id);

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_low
  ON pharmacy_stock(clinic_id, quantity, min_stock_level);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pharmacy_stock_updated_at ON pharmacy_stock;
CREATE TRIGGER trg_pharmacy_stock_updated_at
  BEFORE UPDATE ON pharmacy_stock
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE pharmacy_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_pharmacy_stock" ON pharmacy_stock;
CREATE POLICY "clinic_isolation_pharmacy_stock"
  ON pharmacy_stock FOR ALL TO authenticated
  USING  (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ── Tabela de Movimentações (Audit Trail de Estoque) ──────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id               uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  stock_item_id    uuid            REFERENCES pharmacy_stock(id)   ON DELETE SET NULL,
  medication_name  text            NOT NULL,
  movement_type    text            NOT NULL CHECK (movement_type IN ('DEBIT', 'CREDIT', 'ADJUSTMENT')),
  quantity_change  numeric(10, 3)  NOT NULL,
  quantity_before  numeric(10, 3),
  quantity_after   numeric(10, 3),
  source           text            CHECK (source IN ('CONSULTATION', 'HOSPITALIZATION', 'MANUAL_ADJUSTMENT', 'INITIAL_STOCK', 'RESTOCK')),
  reference_id     uuid,
  notes            text,
  created_by       uuid            REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_clinic_created
  ON stock_movements(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_stock_item
  ON stock_movements(stock_item_id);

-- RLS
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_stock_movements" ON stock_movements;
CREATE POLICY "clinic_isolation_stock_movements"
  ON stock_movements FOR ALL TO authenticated
  USING  (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
