-- 0520 — Agendamento de pagamento no banco passa a ter identidade no título.
--
-- Ao agendar um boleto no Sicoob, o `idPagamento` devolvido pelo banco só
-- ficava escrito no campo de observações. Para CANCELAR um agendamento feito
-- errado é preciso saber esse id e por qual conta ele foi feito — e isso não
-- pode depender de alguém ler uma frase.

ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS bank_payment_id         TEXT,
  ADD COLUMN IF NOT EXISTS bank_payment_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_bank_payment
  ON financial_entries (clinic_id, bank_payment_id)
  WHERE bank_payment_id IS NOT NULL;

COMMENT ON COLUMN financial_entries.bank_payment_id IS
  'idPagamento do agendamento no banco (Sicoob Pagamentos). Nulo = não agendado ou agendamento cancelado.';
COMMENT ON COLUMN financial_entries.bank_payment_account_id IS
  'Conta bancária (credencial/certificado) usada para agendar — a mesma precisa ser usada para cancelar.';
