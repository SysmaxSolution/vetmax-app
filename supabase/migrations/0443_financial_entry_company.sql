-- 0443 — Empresa faturante no título financeiro. Permite atribuir a receita
-- reconhecida (ex.: serviço quitado com crédito) e o faturamento por CNPJ à
-- empresa faturante da OS. Aditiva + idempotente.

ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_company
  ON financial_entries (company_id) WHERE company_id IS NOT NULL;
