-- 0440 — Compras → Contas a Pagar (Fase 1 · item 1.8).
-- Amarra o título de contas a pagar à compra e ao fornecedor, com parcela e
-- espécie do documento; persiste as duplicatas do XML na ordem de compra para
-- pré-preencher as parcelas na finalização da entrada. Aditiva + idempotente.

ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS supplier_id        uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_order_id  uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installment_number int,
  ADD COLUMN IF NOT EXISTS total_installments int,
  ADD COLUMN IF NOT EXISTS especie            text;  -- duplicata/boleto/pix/dinheiro/cartao/outros

CREATE INDEX IF NOT EXISTS idx_financial_entries_purchase
  ON financial_entries (purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_entries_supplier
  ON financial_entries (supplier_id) WHERE supplier_id IS NOT NULL;

-- Duplicatas (parcelas) extraídas do XML da NF-e, para pré-preencher a baixa.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS duplicatas jsonb NOT NULL DEFAULT '[]'::jsonb;
