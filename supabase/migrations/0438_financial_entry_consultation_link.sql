-- 0438 — Vincula título financeiro à consulta (OS) para identificação em Contas a Pagar/Receber.
-- Ex.: pagável gerado ao enviar exame a laboratório parceiro carrega a OS de origem.
-- Aditiva + idempotente (regra CLAUDE.md).

ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_consultation
  ON financial_entries (consultation_id) WHERE consultation_id IS NOT NULL;
