-- =============================================================================
-- VetMax — Migration 0182: financial_entries.issue_date
-- Data de REALIZAÇÃO do procedimento/serviço (pode ser retroativa).
--
-- Antes desta coluna, a UI usava due_date tanto para "vencimento" quanto para
-- "data do procedimento". Procedimentos retroativos perdiam a data correta de
-- realização porque o usuário precisava sobrescrever due_date.
--
-- A partir desta migration:
--   - issue_date  = quando o serviço/procedimento foi executado (NULLable)
--   - due_date    = data limite de pagamento (= issue_date + N dias, se houver)
-- =============================================================================

BEGIN;

ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS issue_date DATE NULL;

COMMENT ON COLUMN financial_entries.issue_date IS
  'Data de realização do procedimento/serviço. Pode ser retroativa. Não confundir com due_date (vencimento).';

CREATE INDEX IF NOT EXISTS idx_financial_entries_issue_date
  ON financial_entries (clinic_id, issue_date);

COMMIT;
