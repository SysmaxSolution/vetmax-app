-- Migration 0099: Expande stock_items para suportar múltiplas categorias de produto

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS is_controlled  boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand          text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sku            text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS barcode        text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS batch_number   text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expiry_date    date     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS supplier       text     DEFAULT NULL;

COMMENT ON COLUMN stock_items.is_controlled IS 'Medicamento controlado (CFMV — Receituário Azul/Amarelo)';
COMMENT ON COLUMN stock_items.brand        IS 'Marca / fabricante do produto';
COMMENT ON COLUMN stock_items.sku          IS 'Código interno do produto';
COMMENT ON COLUMN stock_items.barcode      IS 'Código de barras EAN/QR';
COMMENT ON COLUMN stock_items.batch_number IS 'Número do lote (rastreabilidade)';
COMMENT ON COLUMN stock_items.expiry_date  IS 'Data de validade (alertas automáticos)';
COMMENT ON COLUMN stock_items.supplier     IS 'Fornecedor / distribuidora';

-- Migrar categorias legadas para os novos valores
UPDATE stock_items SET category = 'grooming_supply' WHERE category = 'grooming';
UPDATE stock_items SET category = 'clinic_product'  WHERE category = 'supply';
-- 'medication' e 'other' permanecem válidos

-- Índice para alertas de validade (expiração próxima)
CREATE INDEX IF NOT EXISTS idx_stock_items_expiry
  ON stock_items (clinic_id, expiry_date)
  WHERE expiry_date IS NOT NULL;

-- Índice para busca por categoria
CREATE INDEX IF NOT EXISTS idx_stock_items_category
  ON stock_items (clinic_id, category);
