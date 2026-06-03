-- 0356 — Permite payment_method='courtesy' em invoices
--
-- Algumas clínicas têm procedimentos que, por regra de negócio, não são
-- cobrados (retorno, reavaliação cortesia). Hoje o caixa bloqueia baixa de
-- invoices com total_amount=0. Esta migration libera o método 'courtesy'
-- para registrar que a fatura foi liquidada como cortesia (vs. paga).
--
-- Sprint 2026-06-03 — UX do Caixa.

BEGIN;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_payment_method_check;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_payment_method_check
  CHECK (payment_method IN ('pix', 'credit', 'debit', 'cash', 'courtesy'));

COMMIT;
