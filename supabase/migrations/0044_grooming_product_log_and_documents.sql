-- =============================================================================
-- VetMax — Migration 0044: Product Log & Documents Storage
-- Módulo Banho e Tosa — Rastreamento de consumo e armazenamento de documentos
-- =============================================================================

BEGIN;

-- 1. Extend clinic_catalog to support product quantities (inventory)
ALTER TABLE clinic_catalog
ADD COLUMN IF NOT EXISTS qty_available NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'unit' CHECK (unit IN ('ml', 'g', 'unit', 'l', 'kg'));

-- 2. Create grooming_product_log table
CREATE TABLE IF NOT EXISTS grooming_product_log (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  grooming_session_id UUID            NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  product_id          UUID            NOT NULL REFERENCES clinic_catalog(id) ON DELETE CASCADE,
  quantity_used       NUMERIC(10,2)   NOT NULL CHECK (quantity_used > 0),
  unit                TEXT            NOT NULL CHECK (unit IN ('ml', 'g', 'unit', 'l', 'kg')),
  stage               TEXT            NOT NULL CHECK (stage IN ('bathing', 'grooming', 'drying', 'finishing')),
  recorded_by         UUID            NOT NULL REFERENCES profiles(id),
  created_at          TIMESTAMPTZ     DEFAULT NOW(),

  UNIQUE(grooming_session_id, product_id, stage)
);

-- 3. Extend grooming_documents table with receipt/invoice tracking
ALTER TABLE grooming_documents
ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'document'
  CHECK (document_type IN ('term', 'receipt', 'invoice', 'checklist', 'signature', 'photo')),
ADD COLUMN IF NOT EXISTS document_data JSONB DEFAULT '{}'::jsonb;

-- 4. Trigger: Decremento automático de estoque ao registrar consumo
CREATE OR REPLACE FUNCTION fn_decrement_stock_on_product_log()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clinic_catalog
  SET qty_available = qty_available - NEW.quantity_used
  WHERE id = NEW.product_id
  AND qty_available >= NEW.quantity_used;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient inventory for product %', NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_decrement_stock_on_product_log ON grooming_product_log;
CREATE TRIGGER trg_decrement_stock_on_product_log
  AFTER INSERT ON grooming_product_log
  FOR EACH ROW EXECUTE FUNCTION fn_decrement_stock_on_product_log();

-- 5. Trigger: Prevent double-logging of products in same stage
CREATE OR REPLACE FUNCTION fn_validate_product_stage()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM grooming_product_log
    WHERE grooming_session_id = NEW.grooming_session_id
    AND product_id = NEW.product_id
    AND stage = NEW.stage
  ) > 0 THEN
    RAISE EXCEPTION 'Product already logged for this session and stage';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_product_stage ON grooming_product_log;
CREATE TRIGGER trg_validate_product_stage
  BEFORE INSERT ON grooming_product_log
  FOR EACH ROW EXECUTE FUNCTION fn_validate_product_stage();

-- 6. Indices
CREATE INDEX idx_grooming_product_log_session
  ON grooming_product_log(grooming_session_id, stage);

CREATE INDEX idx_grooming_product_log_product
  ON grooming_product_log(product_id, clinic_id);

CREATE INDEX idx_grooming_product_log_created
  ON grooming_product_log(clinic_id, created_at DESC);

-- Update indices on grooming_documents (if exists)
CREATE INDEX IF NOT EXISTS idx_grooming_documents_type
  ON grooming_documents(session_id, document_type);

-- 7. RLS Policies
ALTER TABLE grooming_product_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_can_view_own_product_logs"
  ON grooming_product_log FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "clinic_can_manage_product_logs"
  ON grooming_product_log FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND recorded_by = auth.uid()
  );

COMMIT;
