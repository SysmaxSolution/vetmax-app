-- 0372 — Cortesia como modalidade de recebimento no Caixa Central (2026-06-12)
--
-- A baixa por cortesia passa a registrar uma linha R$ 0,00 no extrato do caixa
-- (payment_method='courtesy', status='recorded') para rastreabilidade: o operador
-- vê QUE houve um atendimento sem cobrança, quando e de quem.
-- A constraint amount_not_zero é relaxada SOMENTE para cortesia.

ALTER TABLE central_cashier DROP CONSTRAINT IF EXISTS amount_not_zero;
ALTER TABLE central_cashier ADD CONSTRAINT amount_not_zero
  CHECK (amount <> 0 OR payment_method = 'courtesy');
