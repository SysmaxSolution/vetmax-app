-- =============================================================================
-- VetMax — Migration 0074: Especialidades do Usuário
-- Permite definir especialidades por profissional (configurável pelo admin).
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS specialties text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN profiles.specialties
  IS 'Lista de especialidades do profissional (ex: Dermatologia, Ortopedia)';

-- ROLLBACK:
-- ALTER TABLE profiles DROP COLUMN IF EXISTS specialties;
