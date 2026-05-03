-- =============================================================================
-- VetMax — Migration 0076: Foto e Telefone no Perfil
-- Adiciona campos de foto e telefone ao perfil do usuário.
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN profiles.photo_url IS 'URL da foto do perfil do usuário';
COMMENT ON COLUMN profiles.phone IS 'Telefone de contato do profissional';

-- ROLLBACK:
-- ALTER TABLE profiles DROP COLUMN IF EXISTS photo_url;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS phone;
