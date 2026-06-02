-- 0218 — Suporte a faturas parciais por consulta
-- Permite cobrar a consulta no caixa antes do encaminhamento para exames,
-- separando os exames numa segunda fatura (gerada ao finalizar a consulta).
-- Sprint 2026-06-02 — lapidação fluxo de exames.

BEGIN;

-- 1) Remove UNIQUE de invoices.consultation_id — pode haver várias faturas por consulta
--    (parcial + final, ou múltiplas parciais)
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_consultation_id_key;

-- 2) Marca o tipo da fatura. 'final' continua sendo a única que considera a consulta
--    encerrada para fins de auditoria/relatórios. 'partial' é cobrada e marcada como
--    paga, mas não impede novas faturas para a mesma consulta.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'final'
    CHECK (kind IN ('partial', 'final'));

-- 3) Liga cada linha de serviço a uma fatura específica. NULL = ainda não cobrado.
--    Quando uma fatura parcial é gerada, marca os serviços incluídos. A fatura final
--    cobra somente o que ainda está NULL.
ALTER TABLE consultation_services
  ADD COLUMN IF NOT EXISTS billed_in_invoice_id UUID NULL
    REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cs_billed_invoice
  ON consultation_services (billed_in_invoice_id)
  WHERE billed_in_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_consultation_kind
  ON invoices (consultation_id, kind);

-- 4) Garante que só exista UMA fatura 'final' por consulta (idempotência do
--    fluxo de encerramento). Múltiplas parciais são permitidas.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_final_per_consultation
  ON invoices (consultation_id)
  WHERE kind = 'final';

COMMIT;
