-- G-11: tabela bank_statements para armazenar lançamentos bancários importados
CREATE TABLE IF NOT EXISTS bank_statements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  bank_account_id     UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  external_id         TEXT,
  date                DATE NOT NULL,
  amount              NUMERIC(14, 2) NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  type                TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  reconciled_entry_id UUID REFERENCES financial_entries(id) ON DELETE SET NULL,
  import_batch_id     UUID NOT NULL,
  imported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_clinic_id        ON bank_statements (clinic_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_bank_account_id  ON bank_statements (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_import_batch_id  ON bank_statements (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_date             ON bank_statements (date);

-- RLS
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_statements_clinic_isolation"
  ON bank_statements
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );
