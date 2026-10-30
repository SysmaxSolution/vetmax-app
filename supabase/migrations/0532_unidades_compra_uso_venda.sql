-- 0532 — Unidade de compra, de uso e de venda no cadastro do produto.
--
-- O pedido (Clínica Animais, 30/10/2026): o fornecedor manda 1 frasco com
-- 10 mL; a clínica aplica em 0,1 mL e vende em 0,1 mL. Em outro caso o
-- fornecedor manda 1 caixa com 10 frascos, a clínica vende o frasco e aplica
-- em mL. Hoje `stock_items.unit` é uma unidade só, que serve de compra, de
-- saldo, de aplicação e de venda — por isso a entrada de 1 caixa virava 1 no
-- saldo, e a aplicação de 0,1 mL tirava 0,1 "caixa".
--
-- Desenho: `unit` passa a ser explicitamente a UNIDADE DE SALDO (a menor, em
-- que o estoque é contado — mL no exemplo). As outras três dizem como o mundo
-- fala com esse saldo, cada uma com quantas unidades de saldo ela vale:
--
--   unit_purchase = 'CX', factor_purchase = 100   → 1 caixa credita 100 mL
--   unit_use      = 'mL', factor_use      = 0.1   → aplicar 1 dose tira 0,1 mL
--   unit_sale     = 'FR', factor_sale     = 10    → vender 1 frasco tira 10 mL
--
-- Nulo em qualquer uma = "igual à unidade de saldo", que é o comportamento de
-- hoje. Nenhum produto muda de comportamento por esta migration.
--
-- O `units_per_package` (0404) continua existindo e vale como fallback do
-- fator de compra, para não quebrar o que já foi casado em notas antigas.
--
-- Aditiva e idempotente.

BEGIN;

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS unit_purchase   TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS factor_purchase NUMERIC(12,4);
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS unit_use        TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS factor_use      NUMERIC(12,4);
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS unit_sale       TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS factor_sale     NUMERIC(12,4);

-- Fator tem que ser positivo: zero ou negativo faria a conversão sumir com o
-- saldo ou invertê-lo.
ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS chk_stock_fatores_positivos;
ALTER TABLE stock_items ADD CONSTRAINT chk_stock_fatores_positivos CHECK (
  (factor_purchase IS NULL OR factor_purchase > 0) AND
  (factor_use      IS NULL OR factor_use      > 0) AND
  (factor_sale     IS NULL OR factor_sale     > 0)
);

COMMENT ON COLUMN stock_items.unit IS
  'Unidade de SALDO: aquela em que o estoque é contado (a menor do produto, ex.: mL). As outras três convertem para ela.';
COMMENT ON COLUMN stock_items.unit_purchase IS
  'Como o fornecedor vende (CX, FR). NULL = igual à unidade de saldo.';
COMMENT ON COLUMN stock_items.factor_purchase IS
  'Quantas unidades de saldo há em 1 unidade de compra. 1 CX com 10 FR de 10 mL = 100.';
COMMENT ON COLUMN stock_items.unit_use IS
  'Como a equipe aplica (mL, dose, comprimido). NULL = igual à unidade de saldo.';
COMMENT ON COLUMN stock_items.factor_use IS
  'Quantas unidades de saldo saem em 1 unidade de uso. Dose de 0,1 mL com saldo em mL = 0.1.';
COMMENT ON COLUMN stock_items.unit_sale IS
  'Como o balcão vende (FR, mL, UN). NULL = igual à unidade de saldo.';
COMMENT ON COLUMN stock_items.factor_sale IS
  'Quantas unidades de saldo saem em 1 unidade de venda. Vender 1 frasco de 10 mL com saldo em mL = 10.';

-- ── Venda no PDV ────────────────────────────────────────────────────────────
-- O gatilho de venda (0095) abatia a quantidade crua: vender "1 frasco" tirava
-- 1 do saldo em mL. Passa a converter pelo fator de venda. Sem fator, continua
-- exatamente como antes.
CREATE OR REPLACE FUNCTION fn_decrement_stock_on_sale_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fator NUMERIC;
BEGIN
  IF NEW.stock_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(factor_sale, 1) INTO v_fator
  FROM stock_items WHERE id = NEW.stock_item_id;

  UPDATE stock_items
     SET quantity   = quantity - (NEW.quantity * COALESCE(v_fator, 1)),
         updated_at = NOW()
   WHERE id = NEW.stock_item_id
     AND quantity IS NOT NULL;   -- guarda da 0095: item sem controle de saldo

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_decrement_stock_on_sale_item() IS
  'Baixa do PDV convertida para a unidade de saldo pelo factor_sale (0532). Sem fator, comportamento idêntico ao da 0095.';

COMMIT;
