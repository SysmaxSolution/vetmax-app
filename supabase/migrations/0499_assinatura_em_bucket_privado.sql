-- 0499: guarda o CAMINHO da assinatura eletrônica, não a URL pública.
--
-- O bucket `user-signatures` estava `public = true`, e
-- `uploadUserSignature` gravava em `profiles.electronic_signature_url` a URL
-- pública permanente devolvida por `getPublicUrl`. Qualquer pessoa com o
-- endereço — que é previsível, `<clinic_id>/<user_id>/signature.png` — baixaria
-- a imagem da assinatura de um médico veterinário sem estar autenticada.
--
-- A assinatura de MV não é foto de perfil: ela fecha receita, laudo e
-- prontuário. Copiada, assina documento em nome de outra pessoa.
--
-- Em 09/10/2026 o bucket tinha ZERO arquivos nos dois ambientes, então não há
-- backfill nem URL em uso para migrar — é o momento mais barato de trocar o
-- modelo, antes do primeiro upload.
--
-- Novo modelo: grava-se o caminho aqui, e quem renderiza pede uma URL
-- assinada de vida curta (src/lib/storage/assinatura.ts). A coluna antiga fica
-- para trás como compatibilidade: se algum ambiente já tiver URL gravada, o
-- helper continua devolvendo ela.
--
-- Aditiva e idempotente.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS electronic_signature_path TEXT;

COMMENT ON COLUMN profiles.electronic_signature_path IS
  'Caminho da assinatura no bucket privado user-signatures (<clinic_id>/<user_id>/signature.<ext>). '
  'Renderizar via URL assinada — ver src/lib/storage/assinatura.ts. '
  'A coluna electronic_signature_url é legado: URL pública de antes da 0499.';
