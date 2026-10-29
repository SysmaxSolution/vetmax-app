-- 0525 — FinPet/EvoluServices: cobrança amarrada ao título, split por empresa e estorno.
--
-- Até aqui a cobrança na maquininha só poupava a digitação do NSU: não sabia de
-- qual fatura era, aprovar não baixava nada e cancelar só mudava o status.
-- Esta migration dá à transação o elo com o título (fatura/venda e o split de
-- pagamento que a baixou), o registro de estorno e, por empresa faturante, a
-- decisão de mandar o split do profissional (e quem paga a taxa sobre ele).
-- Aditiva, idempotente. Depende de 0508 (card_transactions, company_card_acquirer).

BEGIN;

ALTER TABLE card_transactions
  ADD COLUMN IF NOT EXISTS invoice_id          UUID REFERENCES invoices(id)               ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_id             UUID REFERENCES sales(id)                  ON DELETE SET NULL,
  /** Split de pagamento (invoice_payment_splits) que baixou o título com esta
   *  transação — preenchido pelo caixa ao confirmar, pelo callback (casamento
   *  por NSU) ou pela baixa feita a partir do extrato da maquininha. */
  ADD COLUMN IF NOT EXISTS settled_split_id    UUID REFERENCES invoice_payment_splits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_by          UUID REFERENCES profiles(id)               ON DELETE SET NULL,
  /** Estorno pedido no sistema (a operadora não tem endpoint para venda
   *  aprovada: o cancelamento é feito no portal e confirmado pelo callback). */
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversal_note       TEXT,
  /** Se a cobrança saiu com split do profissional. */
  ADD COLUMN IF NOT EXISTS split_requested     BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_card_transactions_invoice
  ON card_transactions (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_transactions_clinic_status
  ON card_transactions (clinic_id, status);

ALTER TABLE company_card_acquirer
  /** Manda o split do profissional responsável pela OS junto com a cobrança. */
  ADD COLUMN IF NOT EXISTS split_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  /** chargeFees da operadora: TRUE = a taxa incide também na parte do
   *  beneficiário; FALSE = a taxa fica toda com o estabelecimento. */
  ADD COLUMN IF NOT EXISTS split_charge_fees BOOLEAN NOT NULL DEFAULT TRUE;

/** Documento (CPF/CNPJ) do beneficiário na operadora: o callback devolve nome e
 *  documento, nunca o código — é por aqui que o split volta ao profissional. */
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS acquirer_recipient_document TEXT;

COMMENT ON COLUMN card_transactions.settled_split_id IS
  'invoice_payment_splits que baixou o título com esta transação (caixa, callback por NSU ou baixa pelo extrato da maquininha).';
COMMENT ON COLUMN card_transactions.cancel_requested_at IS
  'Estorno pedido no sistema. Transação aprovada só é estornada no portal da operadora; o callback CANCELLED confirma.';
COMMENT ON COLUMN company_card_acquirer.split_enabled IS
  'Manda o split do profissional responsável pela OS (comissão genérica item_type=all) junto com a cobrança na maquininha/link.';
COMMENT ON COLUMN profiles.acquirer_recipient_document IS
  'CPF/CNPJ do beneficiário de split na operadora de cartão (EvoluServices). Casamento do callback é por documento.';

COMMIT;
