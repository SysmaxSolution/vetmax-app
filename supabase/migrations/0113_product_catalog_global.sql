-- ─── product_catalog_global ───────────────────────────────────────────────────
-- Catálogo global de produtos veterinários — compartilhado entre clínicas
-- Serve como base para sugestão de preenchimento (não é por clinic_id)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_catalog_global (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  category      TEXT        NOT NULL,   -- medication | vaccine | grooming_supply | clinic_product
  subcategory   TEXT,
  unit          TEXT,                   -- comprimido | frasco | pipeta | dose | un | kg
  species       TEXT[]      DEFAULT ARRAY['dog','cat'],
  common_brand  TEXT,                   -- nome genérico / nome popular
  brand         TEXT,                   -- marca comercial (fabricante)
  ncm           VARCHAR(10),            -- código NCM fiscal brasileiro
  price_avg     NUMERIC(10,2),          -- preço médio de mercado (R$)
  barcode       TEXT,                   -- código EAN-13
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para busca performática
CREATE INDEX IF NOT EXISTS idx_pcg_name       ON product_catalog_global(name);
CREATE INDEX IF NOT EXISTS idx_pcg_category   ON product_catalog_global(category);
CREATE INDEX IF NOT EXISTS idx_pcg_common_brand ON product_catalog_global(common_brand);
CREATE INDEX IF NOT EXISTS idx_pcg_brand      ON product_catalog_global(brand);
CREATE INDEX IF NOT EXISTS idx_pcg_ncm        ON product_catalog_global(ncm);
CREATE INDEX IF NOT EXISTS idx_pcg_barcode    ON product_catalog_global(barcode);
CREATE INDEX IF NOT EXISTS idx_pcg_species    ON product_catalog_global USING GIN(species);

-- RLS: catálogo global é leitura pública para autenticados
ALTER TABLE product_catalog_global ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_catalog_select" ON product_catalog_global
  FOR SELECT TO authenticated USING (true);

-- Apenas service_role pode inserir/atualizar (seeds e admin)
CREATE POLICY "global_catalog_insert_service" ON product_catalog_global
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "global_catalog_update_service" ON product_catalog_global
  FOR UPDATE TO service_role USING (true);
