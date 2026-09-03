-- 0430: campos para PAGFOR (1.10) — pagamento a fornecedores / contas a pagar.
--
-- boleto (linha digitável / código de barras) e beneficiário permitem cruzar o
-- DDA (boletos emitidos contra o CNPJ da clínica) com os títulos a pagar e lançar
-- os que faltam "mantendo os dados". scheduled_payment_date agenda o pagamento
-- (no vencimento ou em data X) para a remessa PAGFOR. Aditiva.

ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS beneficiary text;
ALTER TABLE financial_entries ADD COLUMN IF NOT EXISTS scheduled_payment_date date;
