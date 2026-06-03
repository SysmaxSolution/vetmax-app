-- 0360 — Juros próprios da clínica no cadastro de cartões (credit_cards)
--
-- Distinção em relação a fee_percent:
--   - fee_percent      = taxa cobrada PELA OPERADORA da clínica (para calcular líquido)
--   - interest_percent = juros que a CLÍNICA repassa ao tutor quando ele paga em cartão
--                        (ex.: 2,99% a.m. para parcelamento próprio)
--   - interest_amount  = juros fixo em R$ (alternativa ao percentual)
--
-- Ambos opcionais e mutuamente independentes. Quando ambos NULL, sem juros.
--
-- Sprint 2026-06-03.

BEGIN;

ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS interest_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS interest_amount  NUMERIC(10,2);

ALTER TABLE credit_cards
  DROP CONSTRAINT IF EXISTS credit_cards_interest_check;

ALTER TABLE credit_cards
  ADD CONSTRAINT credit_cards_interest_check
  CHECK (
    (interest_percent IS NULL OR (interest_percent >= 0 AND interest_percent <= 100))
    AND (interest_amount IS NULL OR interest_amount >= 0)
  );

COMMENT ON COLUMN credit_cards.interest_percent IS 'Juros (em %) que a clínica cobra do tutor quando paga em cartão. Opcional.';
COMMENT ON COLUMN credit_cards.interest_amount  IS 'Juros (em R$) que a clínica cobra do tutor quando paga em cartão. Opcional, alternativa ao percentual.';

COMMIT;
