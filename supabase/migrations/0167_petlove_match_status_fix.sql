-- =============================================================================
-- VetMax — Migration 0167: corrige CHECK de petlove_remittance_lines.match_status
--
-- A migration 0162 criou o CHECK com 'orphan' e SEM 'missing_patient_profile',
-- mas o código (Sprint 2 — petlove-matching.ts e petlove-reconciliation.ts)
-- usa 'orphan_invoice' e 'missing_patient_profile'.
--
-- Resultado: UPDATEs falham silenciosamente (supabase-js retorna data:null
-- error:null em violations de check, e o pipeline pula sem feedback).
--
-- Sintoma: linhas continuavam em 'pending' mesmo após o user clicar Matching,
-- e o applyReconciliation só criava o bônus avulso (única operação que não
-- dependia do match_status).
-- =============================================================================

BEGIN;

ALTER TABLE petlove_remittance_lines
  DROP CONSTRAINT IF EXISTS petlove_remittance_lines_match_status_check;

ALTER TABLE petlove_remittance_lines
  ADD CONSTRAINT petlove_remittance_lines_match_status_check
  CHECK (match_status IN (
    'pending',
    'matched',
    'partial',
    'orphan_invoice',
    'missing_patient_profile',
    'duplicated',
    'manual_resolved',
    'ignored'
  ));

COMMIT;
