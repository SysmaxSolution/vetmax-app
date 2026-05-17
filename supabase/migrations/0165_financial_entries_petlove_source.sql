-- =============================================================================
-- VetMax — Migration 0165: financial_entries.source aceita 'petlove' e 'petlove_indicacao'
-- Sprint 4 (Petlove Reconciliation) — Apply Transaction.
--
-- O motor de conciliação cria 2 lançamentos por remessa aprovada:
--   - source='petlove'           → repasse do mês (Valor Total Atendimento)
--   - source='petlove_indicacao' → bônus de indicação (quando > 0)
-- =============================================================================

BEGIN;

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
    CHECK (source IN ('manual', 'cashier', 'commission', 'petlove', 'petlove_indicacao'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

COMMIT;
