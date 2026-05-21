-- =============================================================================
-- VetMax — Migration 0175: contas a receber em aberto a partir da prévia Petlove
--
-- Quando uma planilha "em aberto" (Worksheet) é importada, cada linha com
-- Status Procedimento = "Liberado" e repasse > 0 vira um financial_entry
-- com status='pending'. Quando a remessa fechada do mesmo período chegar
-- depois, o applyReconciliation baixa o entry pendente (status='paid' +
-- payment_date + settlement_bank_id) em vez de criar um novo.
--
-- Vínculo bidirecional: financial_entries.petlove_remittance_line_id
-- referencia a linha original. ON DELETE SET NULL preserva o entry caso
-- ele tenha sido baixado manualmente e a linha original seja apagada
-- por sobrescrita de prévia.
-- =============================================================================

BEGIN;

-- ─── 1. source aceita 'petlove_open' ────────────────────────────────────────
DO $$
DECLARE
  v_cname TEXT;
BEGIN
  SELECT tc.constraint_name INTO v_cname
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc USING (constraint_name)
  WHERE tc.table_name       = 'financial_entries'
    AND tc.constraint_schema = current_schema()
    AND cc.check_clause      LIKE '%source%'
  LIMIT 1;

  IF v_cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE financial_entries DROP CONSTRAINT %I', v_cname);
  END IF;

  ALTER TABLE financial_entries
    ADD CONSTRAINT financial_entries_source_check
    CHECK (source IN ('manual', 'cashier', 'commission', 'petlove', 'petlove_indicacao', 'petlove_open'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ─── 2. vínculo com a linha da remessa em aberto ────────────────────────────
ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS petlove_remittance_line_id UUID
    REFERENCES petlove_remittance_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_petlove_line
  ON financial_entries (petlove_remittance_line_id)
  WHERE petlove_remittance_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_petlove_open_pending
  ON financial_entries (clinic_id, source, status)
  WHERE source = 'petlove_open' AND status = 'pending';

COMMENT ON COLUMN financial_entries.petlove_remittance_line_id IS
  'Linha em petlove_remittance_lines que originou este entry pendente (formato em aberto). Permite baixa automática quando a remessa fechada do mesmo período chega.';

COMMIT;
