-- Extensão da tabela stock_items para campos fiscais (NF-e / PDV fiscal)
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS ncm              TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS cest             TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS cfop             TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS unit_com         TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS ncm_description  TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS supplier_id      UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- Índice para busca por NCM
CREATE INDEX IF NOT EXISTS idx_stock_items_ncm ON stock_items (clinic_id, ncm) WHERE ncm IS NOT NULL;
-- Índice para busca por barcode (EAN) — barcode já existe; garantir índice
CREATE INDEX IF NOT EXISTS idx_stock_items_barcode ON stock_items (clinic_id, barcode) WHERE barcode IS NOT NULL;
-- Índice para supplier_id
CREATE INDEX IF NOT EXISTS idx_stock_items_supplier ON stock_items (supplier_id) WHERE supplier_id IS NOT NULL;
