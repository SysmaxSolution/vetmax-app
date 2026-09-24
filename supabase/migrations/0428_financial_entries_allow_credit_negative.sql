-- 0428: permite valor NEGATIVO em financial_entries (crédito de cliente).
--
-- O adiantamento/crédito do cliente é representado no CONTAS A RECEBER como um
-- título NEGATIVO (-R$X) — reduz o líquido a receber e some quando consumido.
-- A constraint original CHECK (amount > 0) impedia isso. Relaxa para (amount <> 0)
-- (continua proibindo zero). Não força negativo; só passa a permitir para os
-- títulos de crédito. Idempotente.

ALTER TABLE financial_entries DROP CONSTRAINT IF EXISTS financial_entries_amount_check;
ALTER TABLE financial_entries
  ADD CONSTRAINT financial_entries_amount_check CHECK (amount <> 0);
