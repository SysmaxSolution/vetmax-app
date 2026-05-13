-- Extensão trigram para busca parcial eficiente (deve vir primeiro)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Catálogo global de produtos veterinários (sem clinic_id — dados públicos)
CREATE TABLE IF NOT EXISTS product_catalog_global (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  category      text        NOT NULL,  -- medication, controlled_medication, grooming_supply, aesthetics, vaccine, clinic_product, petshop
  subcategory   text,
  unit          text        NOT NULL DEFAULT 'un',
  description   text,
  common_brand  text,
  species       text[],                -- ['dog','cat','rabbit','bird','others']
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcg_name_trgm ON product_catalog_global USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pcg_category   ON product_catalog_global(category);

-- RLS: leitura pública (sem login necessário para sugestões de cadastro)
ALTER TABLE product_catalog_global ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_global_read" ON product_catalog_global FOR SELECT USING (true);
