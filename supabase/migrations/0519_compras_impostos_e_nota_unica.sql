-- 0519 — Impostos da nota por item + uma nota só pode entrar uma vez.
--
-- (1) O XML traz, por item, CST/CSOSN, base e valor de ICMS, IPI, PIS e
--     COFINS. A entrada guardava só as alíquotas de ICMS/PIS/COFINS — o
--     contador precisa dos VALORES, e o operador precisa poder corrigir o
--     que o fornecedor mandou errado antes de confirmar.
--
-- (2) A mesma chave de acesso podia ser importada duas vezes: duas compras,
--     duas entradas no estoque, dois títulos a pagar. O código passa a
--     recusar; o índice único é a garantia no banco. Como pode já haver
--     duplicata gravada, o índice só é criado se não houver — e, se houver,
--     avisa em vez de derrubar a migration (saneia-se à mão e roda de novo).

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS cst            TEXT,
  ADD COLUMN IF NOT EXISTS icms_origin    TEXT,
  ADD COLUMN IF NOT EXISTS icms_base      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS icms_value     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS icms_st_value  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ipi_value      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS pis_value      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cofins_value   NUMERIC(12,2);

COMMENT ON COLUMN purchase_order_items.cst IS 'CST (regime normal) ou CSOSN (Simples) do ICMS, como veio na nota ou corrigido na entrada.';
COMMENT ON COLUMN purchase_order_items.icms_origin IS 'Origem da mercadoria (campo orig do ICMS: 0 nacional … 8).';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM purchase_orders
     WHERE nfe_key IS NOT NULL
     GROUP BY clinic_id, nfe_key
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE '0519: há notas duplicadas em purchase_orders — índice único NÃO criado; saneie e rode de novo.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_nota
      ON purchase_orders (clinic_id, nfe_key)
      WHERE nfe_key IS NOT NULL;
  END IF;
END $$;
