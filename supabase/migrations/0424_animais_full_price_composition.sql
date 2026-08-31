-- 0424: Composição de preço COMPLETA + modos de precificação (Sprint Animais).
-- Estende a composição simples (0422) para o modelo detalhado do cliente:
--   Preço de compra -> (desconto fornecedor) -> (impostos de entrada) -> Preço de Custo
--   -> (margem OU markup) -> (impostos de venda) -> preço de venda / tabelas.
-- Aditiva (IF NOT EXISTS). Campos preenchidos manualmente OU via entrada de XML de NF-e.

-- ─── (a) COMPOSIÇÃO COMPLETA no cadastro de produto/serviço (stock_items) ─────
-- Já existem de 0422: cost_price, entry_tax_percent (agregado do modo simples), margin_percent.
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS purchase_price           NUMERIC(12,2); -- Pr. Compra (sem impostos)
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS supplier_discount_percent NUMERIC(6,3); -- % Desconto do fornecedor (-)
-- Impostos de entrada detalhados (%). ICMS é crédito (subtrai); demais somam.
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS entry_tax_icms    NUMERIC(6,3); -- % ICMS entrada (-)
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS entry_tax_st      NUMERIC(6,3); -- % Substituição Tributária (+)
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS entry_tax_ipi     NUMERIC(6,3); -- % IPI (+)
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS entry_tax_freight NUMERIC(6,3); -- % Frete (+)
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS entry_tax_ibs_cbs NUMERIC(6,3); -- % IBS/CBS (+) — reforma tributária 2026
-- Imposto sobre a VENDA (%) — entra na formação do preço de venda.
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS sale_tax_percent  NUMERIC(6,3);

-- ─── (b) MODOS DE PRECIFICAÇÃO (por clínica) em pricing_settings ──────────────
-- composição simples x completa; cálculo por margem x markup.
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS composition_mode TEXT NOT NULL DEFAULT 'simple'
  CHECK (composition_mode IN ('simple','complete'));
ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS margin_calc_type TEXT NOT NULL DEFAULT 'margin'
  CHECK (margin_calc_type IN ('margin','markup'));
