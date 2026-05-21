-- =============================================================================
-- VetMax — Migration 0174: petlove_remittances "em aberto" (preview)
--
-- A Petlove distribui dois tipos de relatório XLSX:
--   1. Fechado: abas "Resumo Contas Médicas" + "Extrato Contas Médicas" — vem
--      com número de remessa, período, status e totais já consolidados.
--   2. Aberto: aba única "Worksheet" — extrato em aberto, sem número de
--      remessa nem cabeçalho. O prestador baixa para acompanhar.
--
-- Para suportar o formato aberto sem ter número de remessa oficial, geramos
-- um sintético "OPEN-YYYYMM" e marcamos a linha com is_preview=true e
-- status='open'. Reimportar uma remessa "open" do mesmo período sobrescreve
-- as linhas (atualização incremental).
-- =============================================================================

BEGIN;

-- ─── status: aceitar 'open' ─────────────────────────────────────────────────
ALTER TABLE petlove_remittances
  DROP CONSTRAINT IF EXISTS petlove_remittances_status_check;

ALTER TABLE petlove_remittances
  ADD CONSTRAINT petlove_remittances_status_check
  CHECK (status IN ('open','imported','reviewed','reconciled','reversed'));

-- ─── novas colunas ──────────────────────────────────────────────────────────
ALTER TABLE petlove_remittances
  ADD COLUMN IF NOT EXISTS is_preview BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE petlove_remittances
  ADD COLUMN IF NOT EXISTS source_format TEXT NOT NULL DEFAULT 'closed'
    CHECK (source_format IN ('closed','open'));

CREATE INDEX IF NOT EXISTS idx_petlove_remittances_preview
  ON petlove_remittances (clinic_id, is_preview)
  WHERE is_preview = true;

COMMENT ON COLUMN petlove_remittances.is_preview IS
  'true quando a remessa foi importada do extrato "em aberto" (formato Worksheet) — pode ser sobrescrita ao reimportar.';
COMMENT ON COLUMN petlove_remittances.source_format IS
  'closed=arquivo oficial com cabeçalho de remessa; open=extrato em aberto sem número/período declarado.';

-- ─── linhas: dados extras presentes apenas no formato em aberto ─────────────
ALTER TABLE petlove_remittance_lines
  ADD COLUMN IF NOT EXISTS gender_raw            TEXT;

ALTER TABLE petlove_remittance_lines
  ADD COLUMN IF NOT EXISTS procedure_status_raw  TEXT;

ALTER TABLE petlove_remittance_lines
  ADD COLUMN IF NOT EXISTS financial_status_raw  TEXT;

COMMENT ON COLUMN petlove_remittance_lines.gender_raw IS
  'Sexo do pet conforme planilha (apenas formato em aberto). Usado para enriquecer o cadastro de patients.';
COMMENT ON COLUMN petlove_remittance_lines.procedure_status_raw IS
  'Status do procedimento na Petlove (Liberado, Em análise) — apenas formato em aberto.';
COMMENT ON COLUMN petlove_remittance_lines.financial_status_raw IS
  'Status financeiro na Petlove (Pago, Não Pago) — apenas formato em aberto.';

COMMIT;
