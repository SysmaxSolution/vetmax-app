-- =============================================================================
-- VetMax — Migration 0164: created_from em patients/tutors
-- Sprint 2 (Petlove Reconciliation) — Bulk Auto-Register de pets órfãos.
--
-- Marca cadastros criados via importação automática (ex: planilha Petlove)
-- para que o admin possa filtrar e completar manualmente depois.
-- =============================================================================

BEGIN;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS created_from TEXT;

ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS created_from TEXT;

CREATE INDEX IF NOT EXISTS idx_patients_created_from
  ON patients (clinic_id, created_from)
  WHERE created_from IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tutors_created_from
  ON tutors (clinic_id, created_from)
  WHERE created_from IS NOT NULL;

COMMENT ON COLUMN patients.created_from IS
  'Origem do cadastro: NULL=manual, ''petlove_import''=criado em massa via planilha. Sinaliza cadastros que precisam ser revisados manualmente.';

COMMENT ON COLUMN tutors.created_from IS
  'Origem do cadastro: NULL=manual, ''petlove_import''=criado em massa via planilha. Sinaliza cadastros que precisam ser revisados manualmente.';

COMMIT;
