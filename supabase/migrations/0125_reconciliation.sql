-- G-11: tabela reconciliation_batches para rastrear lotes de conciliação
CREATE TABLE IF NOT EXISTS reconciliation_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  source          TEXT NOT NULL, -- 'ofx' | 'csv' | 'txt' | 'xlsx' | 'bb_api'
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_records   INT NOT NULL DEFAULT 0,
  matched_count   INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_batches_clinic_id       ON reconciliation_batches (clinic_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_batches_bank_account_id ON reconciliation_batches (bank_account_id);

-- RLS
ALTER TABLE reconciliation_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reconciliation_batches_clinic_isolation"
  ON reconciliation_batches
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );
