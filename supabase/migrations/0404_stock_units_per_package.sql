-- 0404_stock_units_per_package.sql
-- M13(b) — unidade de medida: quantos itens-base há por embalagem comprada.
-- Ex.: caixa de 30 comprimidos → units_per_package = 30. No recebimento, o
-- estoque é creditado em itens-base (comprimidos) e o preço unitário é dividido.
-- Default 1 = comportamento atual (não afeta itens existentes). Aditiva/idempotente.

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS units_per_package INTEGER NOT NULL DEFAULT 1;
