-- 0526 — Tabelas de preço com vigência e preço de urgência, setor do item e
-- comissão por setor / valor fixo (pedido da Animais, 29/10/2026, e base da
-- importação do catálogo do Vertis).
-- Aditiva, idempotente.

BEGIN;

-- ── Preço por tabela: vigência, urgência e histórico ─────────────────────────
ALTER TABLE price_table_items
  ADD COLUMN IF NOT EXISTS urgent_price NUMERIC(12,2),
  /** Desde quando este preço vale. A linha é sempre o preço VIGENTE; o que
   *  valia antes vai para price_table_item_history. */
  ADD COLUMN IF NOT EXISTS valid_from   DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS cost_price   NUMERIC(12,2);

ALTER TABLE price_tables
  /** Acréscimo de urgência da tabela (%), quando o item não tem preço de urgência próprio. */
  ADD COLUMN IF NOT EXISTS urgency_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  /** Código no sistema de origem (importação). */
  ADD COLUMN IF NOT EXISTS source_code TEXT;

CREATE TABLE IF NOT EXISTS price_table_item_history (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      UUID          NOT NULL REFERENCES clinics(id)      ON DELETE CASCADE,
  price_table_id UUID          NOT NULL REFERENCES price_tables(id) ON DELETE CASCADE,
  stock_item_id  UUID          NOT NULL REFERENCES stock_items(id)  ON DELETE CASCADE,
  price          NUMERIC(12,2) NOT NULL,
  urgent_price   NUMERIC(12,2),
  cost_price     NUMERIC(12,2),
  margin_percent NUMERIC(6,3),
  valid_from     DATE          NOT NULL,
  /** Até quando valeu (dia anterior ao valid_from do preço seguinte). NULL = importado sem sucessor conhecido. */
  valid_until    DATE,
  replaced_by    UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_history_item ON price_table_item_history (clinic_id, stock_item_id, price_table_id, valid_from DESC);
ALTER TABLE price_table_item_history ENABLE ROW LEVEL SECURITY;

/** Ao trocar o preço vigente, guarda o anterior no histórico. */
CREATE OR REPLACE FUNCTION trg_price_table_items_history() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.price IS DISTINCT FROM NEW.price OR OLD.urgent_price IS DISTINCT FROM NEW.urgent_price OR OLD.valid_from IS DISTINCT FROM NEW.valid_from) THEN
    INSERT INTO price_table_item_history (clinic_id, price_table_id, stock_item_id, price, urgent_price, cost_price, margin_percent, valid_from, valid_until)
    VALUES (OLD.clinic_id, OLD.price_table_id, OLD.stock_item_id, OLD.price, OLD.urgent_price, OLD.cost_price, OLD.margin_percent, OLD.valid_from,
            CASE WHEN NEW.valid_from > OLD.valid_from THEN NEW.valid_from - 1 ELSE CURRENT_DATE END);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS price_table_items_history ON price_table_items;
CREATE TRIGGER price_table_items_history BEFORE UPDATE ON price_table_items
  FOR EACH ROW EXECUTE FUNCTION trg_price_table_items_history();

-- ── Setor do item (Laboratório, Imagem, Clínica Médica, Cirurgia, Loja…) ──────
ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS sector      TEXT,
  /** Código no sistema de origem (importação) — evita duplicar ao reimportar. */
  ADD COLUMN IF NOT EXISTS source_code TEXT;
CREATE INDEX IF NOT EXISTS idx_stock_items_sector ON stock_items (clinic_id, sector) WHERE sector IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_items_source_code ON stock_items (clinic_id, source_code) WHERE source_code IS NOT NULL;

-- ── Comissão por setor e por valor fixo ──────────────────────────────────────
ALTER TABLE user_commissions
  ADD COLUMN IF NOT EXISTS sector       TEXT,
  /** Valor fixo por unidade vendida (alternativa ao percentual). */
  ADD COLUMN IF NOT EXISTS fixed_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valid_from   DATE,
  ADD COLUMN IF NOT EXISTS valid_until  DATE;
ALTER TABLE user_commissions ALTER COLUMN percentage SET DEFAULT 0;
ALTER TABLE user_commissions DROP CONSTRAINT IF EXISTS user_commissions_item_type_check;
ALTER TABLE user_commissions ADD CONSTRAINT user_commissions_item_type_check
  CHECK (item_type IN ('all', 'product', 'service', 'package', 'sector'));

COMMENT ON COLUMN price_table_items.valid_from IS 'Início de vigência do preço vigente; o anterior fica em price_table_item_history.';
COMMENT ON COLUMN stock_items.sector IS 'Setor do item (ex.: LAB - Hematologia, IMG - Tomografia, CMED - Consultas): agrupa comissões e relatórios.';
COMMENT ON COLUMN user_commissions.sector IS 'Com item_type=sector: a regra vale para todos os itens de stock_items.sector igual.';

COMMIT;
