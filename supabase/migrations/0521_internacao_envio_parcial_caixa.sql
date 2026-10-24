-- 0521 — Conta da internação pode ir ao caixa em partes.
--
-- Antes, "Transferir para PDV" fechava a conta inteira de uma vez e criava
-- UM lançamento no caixa por internação (idempotente por source_id). Numa
-- internação longa o tutor paga por etapas: o que já foi lançado vai ao caixa
-- agora, a conta continua aberta para novos itens, e no fim cobra-se só o
-- que falta. Para isso cada lote enviado precisa saber a qual lançamento do
-- caixa pertence — é o que esta coluna guarda.

ALTER TABLE hospitalization_charges
  ADD COLUMN IF NOT EXISTS central_cashier_id UUID REFERENCES central_cashier(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hosp_charges_cashier
  ON hospitalization_charges (central_cashier_id)
  WHERE central_cashier_id IS NOT NULL;

COMMENT ON COLUMN hospitalization_charges.central_cashier_id IS
  'Lançamento do caixa central em que esta linha foi enviada para recebimento (lote parcial).';
