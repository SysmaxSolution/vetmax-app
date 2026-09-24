-- 0422: Precificação da Sprint Animais (Fase 0, peça 3).
-- (a) Composição de preço por item: custo, impostos de entrada, margem
--     (preço de venda segue em stock_items.unit_price).
-- (b) Até 5 TABELAS DE PREÇO nomeadas por clínica; o mesmo item pode ter
--     5 preços de venda diferentes (price_table_items).
-- (c) pricing_settings: tabela padrão B2C + precedência (produto x cliente).
-- Aditiva. RLS sem policy pública (acesso via service role).
-- Hierarquia de resolução (aplicada no lançamento do serviço, na app):
--   preço fixo do pet (patient_custom_prices) > tabela do cliente/parceira
--   > preço padrão do item (unit_price), conforme a precedência configurada.

-- ─── (a) COMPOSIÇÃO DE PREÇO no cadastro de produto/serviço ─────────────────
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS cost_price        NUMERIC(12,2);
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS entry_tax_percent NUMERIC(6,3);  -- impostos de entrada (%)
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS margin_percent    NUMERIC(6,3);  -- margem (%)
-- unit_price = preço de venda (já existe). Pode ser calculado de custo+imposto+margem ou manual.

-- ─── (b) TABELAS DE PREÇO (até 5 por clínica) ──────────────────────────────
CREATE TABLE IF NOT EXISTS price_tables (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id  UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  slot       SMALLINT    NOT NULL CHECK (slot BETWEEN 1 AND 5),  -- limita a 5 tabelas
  name       TEXT        NOT NULL,                               -- "Balcão", "Parceiro Ouro"...
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_price_tables_clinic ON price_tables (clinic_id) WHERE is_active;
ALTER TABLE price_tables ENABLE ROW LEVEL SECURITY;

-- preço de cada item em cada tabela (mesmo item, até 5 preços)
CREATE TABLE IF NOT EXISTS price_table_items (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id      UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  price_table_id UUID        NOT NULL REFERENCES price_tables(id) ON DELETE CASCADE,
  stock_item_id  UUID        NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  price          NUMERIC(12,2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (price_table_id, stock_item_id)
);
CREATE INDEX IF NOT EXISTS idx_price_table_items_item ON price_table_items (stock_item_id);
CREATE INDEX IF NOT EXISTS idx_price_table_items_table ON price_table_items (price_table_id);
ALTER TABLE price_table_items ENABLE ROW LEVEL SECURITY;

-- ─── (c) CONFIGURAÇÕES DE PREÇO (por clínica) ──────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_settings (
  clinic_id                UUID        NOT NULL PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  default_b2c_price_table_id UUID      REFERENCES price_tables(id) ON DELETE SET NULL,  -- tabela p/ cliente direto
  precedence               TEXT        NOT NULL DEFAULT 'client'
                             CHECK (precedence IN ('client','product')),  -- seguir tabela do cliente ou do produto
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;
