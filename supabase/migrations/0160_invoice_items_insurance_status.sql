-- =============================================================================
-- VetMax — Migration 0160: invoice_items — Conciliação Ativa de Convênios
-- Sprint 1 (Petlove Reconciliation) — Aditiva, sem alterações destrutivas.
--
-- Adiciona colunas para tratar o convênio como "Conta a Receber Variável":
--   - insurance_status: estado do repasse (particular | aguardando_repasse | conciliado | glosa)
--   - expected_value:   valor estimado no lançamento (média histórica do procedimento)
--   - realized_value:   valor confirmado pela planilha do convênio
--   - coparticipation_value: parcela paga pelo tutor
--   - provider_id, external_procedure_name, glosa_reason: rastro do convênio
--   - reconciled_at, reconciled_by: auditoria
-- =============================================================================

BEGIN;

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS insurance_status        TEXT NOT NULL DEFAULT 'particular'
    CHECK (insurance_status IN (
      'particular',
      'aguardando_repasse',
      'conciliado',
      'glosa',
      'ajuste_credito',
      'ajuste_debito'
    )),
  ADD COLUMN IF NOT EXISTS expected_value          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS realized_value          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS coparticipation_value   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS provider_id             UUID REFERENCES insurance_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_procedure_name TEXT,
  ADD COLUMN IF NOT EXISTS glosa_reason            TEXT,
  ADD COLUMN IF NOT EXISTS reconciled_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_items_insurance_status
  ON invoice_items (insurance_status);

CREATE INDEX IF NOT EXISTS idx_invoice_items_provider_id
  ON invoice_items (provider_id);

COMMENT ON COLUMN invoice_items.insurance_status IS
  'Estado do repasse do convênio: particular (sem convênio), aguardando_repasse, conciliado, glosa, ajuste_credito, ajuste_debito.';

COMMENT ON COLUMN invoice_items.expected_value IS
  'Valor de repasse esperado no momento do lançamento (média histórica observada na tabela petlove_procedure_mappings).';

COMMENT ON COLUMN invoice_items.realized_value IS
  'Valor de repasse confirmado pela planilha do convênio. Preenchido após applyReconciliation.';

COMMIT;
