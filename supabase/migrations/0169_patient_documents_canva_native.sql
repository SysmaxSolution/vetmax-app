-- =============================================================================
-- VetMax — Migration 0169: patient_documents Canva Nativo (ROTA A)
--
-- Pivôt arquitetural: abandona o modelo .docx + Gotenberg e passa ao motor
-- HTML-to-PDF nativo (React + Tailwind + @media print). Colunas aditivas com
-- IF NOT EXISTS para suportar:
--   - papel timbrado de fundo (marca d'água) da clínica
--   - margens de segurança em cm (top/bottom/left/right)
--   - estilo do bloco de dados do pet (solid | transparent)
--   - content_json com static_fields + dynamic_fields[] (chaves dinâmicas
--     definidas pelo veterinário em tempo de atendimento)
--
-- IDEMPOTENTE. Não destrói colunas do Pixel Perfect overlay engine — o
-- histórico de laudos antigos permanece consultável.
-- =============================================================================

-- 1) Papel timbrado de fundo (URL no bucket privado patient-documents-bg)
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS background_image_url text;

COMMENT ON COLUMN patient_documents.background_image_url IS
  'Papel timbrado de fundo (marca d''água) — signed URL gerada do bucket privado patient-documents-bg.';

-- 2) Margens de segurança em centímetros (default 2cm)
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS margin_top    numeric(4,2) NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS margin_bottom numeric(4,2) NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS margin_left   numeric(4,2) NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS margin_right  numeric(4,2) NOT NULL DEFAULT 2.0;

COMMENT ON COLUMN patient_documents.margin_top    IS 'Margem superior em cm para o bloco de texto não colidir com o papel timbrado.';
COMMENT ON COLUMN patient_documents.margin_bottom IS 'Margem inferior em cm.';
COMMENT ON COLUMN patient_documents.margin_left   IS 'Margem esquerda em cm.';
COMMENT ON COLUMN patient_documents.margin_right  IS 'Margem direita em cm.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name = 'patient_documents_margins_nonneg_chk'
  ) THEN
    ALTER TABLE patient_documents
      ADD CONSTRAINT patient_documents_margins_nonneg_chk
        CHECK (
          margin_top    >= 0 AND margin_top    <= 10
          AND margin_bottom >= 0 AND margin_bottom <= 10
          AND margin_left   >= 0 AND margin_left   <= 10
          AND margin_right  >= 0 AND margin_right  <= 10
        );
  END IF;
END
$$ LANGUAGE plpgsql;

-- 3) Estilo do bloco de dados do pet
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS block_style text NOT NULL DEFAULT 'solid';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name = 'patient_documents_block_style_chk'
  ) THEN
    ALTER TABLE patient_documents
      ADD CONSTRAINT patient_documents_block_style_chk
        CHECK (block_style IN ('solid', 'transparent'));
  END IF;
END
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN patient_documents.block_style IS
  'Estilo do bloco de dados do pet: solid (caixa cinza arredondada) ou transparent (texto direto sobre o timbrado).';

-- 4) content_json (static_fields + dynamic_fields[])
-- A coluna content_data jsonb já existe desde 0008. Esta migration adiciona
-- content_json com schema canva-nativo. content_data permanece para retro.
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS content_json jsonb NOT NULL DEFAULT '{"static_fields":{}, "dynamic_fields":[]}'::jsonb;

COMMENT ON COLUMN patient_documents.content_json IS
  'Schema canva-nativo: {static_fields:{medicamentos,posologia,...}, dynamic_fields:[{key,value}]}. dynamic_fields permite ao vet criar campos em tempo de atendimento (Pressão Arterial, Glicemia, etc).';

-- Sanity check: shape mínimo do content_json
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name = 'patient_documents_content_json_shape_chk'
  ) THEN
    ALTER TABLE patient_documents
      ADD CONSTRAINT patient_documents_content_json_shape_chk
        CHECK (
          jsonb_typeof(content_json -> 'static_fields') = 'object'
          AND jsonb_typeof(content_json -> 'dynamic_fields') = 'array'
        );
  END IF;
END
$$ LANGUAGE plpgsql;

-- 5) Bucket privado para papel timbrado de fundo (separado de patient-documents)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-documents-bg',
  'patient-documents-bg',
  false,
  10485760,  -- 10 MB por imagem (PNG/JPG alta resolução)
  ARRAY['image/png','image/jpeg','image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- 6) RLS storage — papel timbrado isolado por clinic_id (segmento 0 do path)
DROP POLICY IF EXISTS "pdocbg_read_clinic" ON storage.objects;
CREATE POLICY "pdocbg_read_clinic"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'patient-documents-bg'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pdocbg_write_admin" ON storage.objects;
CREATE POLICY "pdocbg_write_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'patient-documents-bg'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "pdocbg_update_admin" ON storage.objects;
CREATE POLICY "pdocbg_update_admin"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'patient-documents-bg'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "pdocbg_delete_admin" ON storage.objects;
CREATE POLICY "pdocbg_delete_admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'patient-documents-bg'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 7) Espelho das mesmas colunas em document_templates — admin configura
-- padrão da clínica e o vet apenas reutiliza no fechamento do laudo.
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS background_image_url text,
  ADD COLUMN IF NOT EXISTS margin_top    numeric(4,2) NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS margin_bottom numeric(4,2) NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS margin_left   numeric(4,2) NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS margin_right  numeric(4,2) NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS block_style text NOT NULL DEFAULT 'solid';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name = 'document_templates_block_style_chk'
  ) THEN
    ALTER TABLE document_templates
      ADD CONSTRAINT document_templates_block_style_chk
        CHECK (block_style IN ('solid', 'transparent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name = 'document_templates_margins_nonneg_chk'
  ) THEN
    ALTER TABLE document_templates
      ADD CONSTRAINT document_templates_margins_nonneg_chk
        CHECK (
          margin_top    >= 0 AND margin_top    <= 10
          AND margin_bottom >= 0 AND margin_bottom <= 10
          AND margin_left   >= 0 AND margin_left   <= 10
          AND margin_right  >= 0 AND margin_right  <= 10
        );
  END IF;
END
$$ LANGUAGE plpgsql;

-- 8) Índice parcial para listar apenas templates já no novo motor
CREATE INDEX IF NOT EXISTS idx_document_templates_canva_native
  ON document_templates(clinic_id)
  WHERE background_image_url IS NOT NULL;
