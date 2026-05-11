-- Migration 0098: Campos extras de perfil para modal unificado G-08+G-10

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_name                  text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address                    text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_active                  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS room                       text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS electronic_signature_url   text    DEFAULT NULL;

COMMENT ON COLUMN profiles.last_name                IS 'Sobrenome separado para exibição formal';
COMMENT ON COLUMN profiles.address                  IS 'Endereço residencial ou profissional';
COMMENT ON COLUMN profiles.is_active                IS 'Usuário ativo/inativo na clínica';
COMMENT ON COLUMN profiles.room                     IS 'Box/sala onde o profissional atende';
COMMENT ON COLUMN profiles.electronic_signature_url IS 'URL da assinatura eletrônica para carimbo em documentos (Supabase Storage)';

-- Bucket para assinaturas eletrônicas (idempotente via policy, o bucket precisa ser criado via dashboard ou CLI)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
