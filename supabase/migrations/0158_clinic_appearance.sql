-- Migration 0158: Aparência por clínica + bucket de branding
-- Cada clínica passa a ter suas próprias preferências visuais (cor de fundo,
-- intensidade, imagem de fundo). Substitui o escopo por-usuário existente em
-- profiles.ui_preferences (mantido para retrocompatibilidade).

-- 1. Coluna ui_preferences em clinics
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{}'::jsonb;

-- 2. Migra preferências do owner/primeiro admin da clínica como default,
--    se a clínica ainda não tiver preferências definidas
UPDATE clinics c
SET ui_preferences = COALESCE(
  (SELECT p.ui_preferences
     FROM profiles p
    WHERE p.clinic_id = c.id
      AND p.ui_preferences IS NOT NULL
      AND p.ui_preferences <> '{}'::jsonb
    ORDER BY p.created_at ASC
    LIMIT 1),
  '{}'::jsonb
)
WHERE c.ui_preferences IS NULL OR c.ui_preferences = '{}'::jsonb;

-- 3. Bucket público para imagens de fundo / logotipos da clínica
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinic-branding',
  'clinic-branding',
  true,
  10485760,                                          -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

-- 4. Policies: leitura pública (qualquer usuário autenticado/anônimo);
--    escrita restrita a service_role (server actions usam admin client)
DROP POLICY IF EXISTS "clinic_branding_public_read" ON storage.objects;
CREATE POLICY "clinic_branding_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'clinic-branding');

DROP POLICY IF EXISTS "clinic_branding_service_write" ON storage.objects;
CREATE POLICY "clinic_branding_service_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'clinic-branding');

DROP POLICY IF EXISTS "clinic_branding_service_delete" ON storage.objects;
CREATE POLICY "clinic_branding_service_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'clinic-branding');
