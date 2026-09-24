-- 0431: conciliação bancária N:1 — vários títulos do sistema podem compor UMA
-- linha do extrato (ex.: repasse único do cartão = várias transações no sistema).
--
-- Substitui o vínculo 1:1 (bank_statements.reconciled_entry_id) por uma tabela de
-- vínculos, e separa VÍNCULO de CONCILIAÇÃO (reconciled_at por linha). Aditiva:
-- reconciled_entry_id é mantido e retro-alimentado como vínculo.

CREATE TABLE IF NOT EXISTS bank_statement_entry_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL,
  statement_id uuid NOT NULL REFERENCES bank_statements(id)   ON DELETE CASCADE,
  entry_id     uuid NOT NULL REFERENCES financial_entries(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (statement_id, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_bsel_statement ON bank_statement_entry_links(statement_id);
CREATE INDEX IF NOT EXISTS idx_bsel_entry     ON bank_statement_entry_links(entry_id);
CREATE INDEX IF NOT EXISTS idx_bsel_clinic    ON bank_statement_entry_links(clinic_id);

ALTER TABLE bank_statements ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

-- retro-alimenta vínculos existentes (auto-match antigo usava reconciled_entry_id)
INSERT INTO bank_statement_entry_links (clinic_id, statement_id, entry_id)
  SELECT clinic_id, id, reconciled_entry_id
  FROM bank_statements
  WHERE reconciled_entry_id IS NOT NULL
  ON CONFLICT (statement_id, entry_id) DO NOTHING;
