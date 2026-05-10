-- Migration 0094: Campos adicionais de perfil profissional (G-10)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nickname   text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS photo_url  text        DEFAULT NULL;

COMMENT ON COLUMN profiles.nickname  IS 'Nome de exibição curto (apelido) exibido no header e módulos';
COMMENT ON COLUMN profiles.photo_url IS 'URL da foto de perfil (Supabase Storage ou URL externa)';
