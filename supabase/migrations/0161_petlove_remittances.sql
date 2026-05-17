-- =============================================================================
-- VetMax — Migration 0161: petlove_remittances
-- Sprint 1 (Petlove Reconciliation) — Header da remessa importada.
--
-- Uma remessa = um arquivo .xlsx da Petlove com 100–200 procedimentos.
-- Chave única: (clinic_id, provider_id, remittance_number) — bloqueia
-- importação duplicada da mesma remessa pela mesma clínica/convênio.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS petlove_remittances (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                   UUID          NOT NULL REFERENCES clinics(id)              ON DELETE CASCADE,
  provider_id                 UUID          NOT NULL REFERENCES insurance_providers(id)  ON DELETE RESTRICT,

  remittance_number           TEXT          NOT NULL,
  period_start                DATE          NOT NULL,
  period_end                  DATE          NOT NULL,

  status                      TEXT          NOT NULL DEFAULT 'imported'
                                            CHECK (status IN ('imported','reviewed','reconciled','reversed')),

  total_service_value         NUMERIC(12,2) NOT NULL DEFAULT 0,
  referral_bonus_value        NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_adjustment           NUMERIC(12,2) NOT NULL DEFAULT 0,
  debit_adjustment            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gross_value           NUMERIC(12,2) NOT NULL,

  raw_summary                 JSONB         NOT NULL DEFAULT '{}'::jsonb,

  imported_by                 UUID          REFERENCES auth.users(id)        ON DELETE SET NULL,
  imported_at                 TIMESTAMPTZ   NOT NULL DEFAULT now(),
  reconciled_at               TIMESTAMPTZ,
  bank_statement_id           UUID          REFERENCES bank_statements(id)   ON DELETE SET NULL,
  financial_entry_id          UUID          REFERENCES financial_entries(id) ON DELETE SET NULL,
  referral_financial_entry_id UUID          REFERENCES financial_entries(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE (clinic_id, provider_id, remittance_number)
);

CREATE INDEX IF NOT EXISTS idx_petlove_remittances_clinic
  ON petlove_remittances (clinic_id);

CREATE INDEX IF NOT EXISTS idx_petlove_remittances_provider
  ON petlove_remittances (provider_id);

CREATE INDEX IF NOT EXISTS idx_petlove_remittances_status
  ON petlove_remittances (clinic_id, status);

ALTER TABLE petlove_remittances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_petlove_remittances" ON petlove_remittances;
CREATE POLICY "clinic_isolation_petlove_remittances"
  ON petlove_remittances FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE petlove_remittances IS
  'Header de cada remessa de pagamento importada de um convênio (Petlove). Uma linha por arquivo .xlsx processado.';

COMMIT;
