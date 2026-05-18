-- =============================================================================
-- VetMax — Migration 0157: Templates DOCX nativos (docxtemplater)
--
-- Camada de injecao XML nativa via docxtemplater + pizzip. O DOCX original
-- e' guardado no bucket document-templates e renderizado server-side a cada
-- geracao. Conversao final para PDF acontece em outra camada (LibreOffice /
-- Gotenberg) somente na ultima milha.
--
-- IDEMPOTENTE: aditiva com IF NOT EXISTS (regra CLAUDE.md).
-- =============================================================================

-- 1) Coluna engine: 'pdf' (legado, OCR Sniper) | 'docx-native' (novo motor)
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'pdf';

COMMENT ON COLUMN document_templates.engine IS
  'Motor de renderizacao do template: pdf (OCR Sniper / Flatten & Clean) ou docx-native (docxtemplater).';

-- 2) Path do DOCX original (independente do PDF legado)
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS original_docx_path text;

COMMENT ON COLUMN document_templates.original_docx_path IS
  'Path no bucket document-templates: {clinic_id}/{template_id}/template.docx';

-- 3) Tags detectadas no DOCX (literal -> canonical + ocorrencias)
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS docx_tags jsonb;

COMMENT ON COLUMN document_templates.docx_tags IS
  'Array de objetos { literal, canonical, occurrences } extraidos via scanDocxTags.';

-- 4) Indice parcial para queries por engine docx-native
CREATE INDEX IF NOT EXISTS idx_document_templates_engine_docx
  ON document_templates(clinic_id, engine)
  WHERE engine = 'docx-native';

-- 5) Permitir DOCX no bucket document-templates (alem do PDF ja existente)
-- A coluna allowed_mime_types e' text[] — concatena se nao tiver o tipo.
DO $$
BEGIN
  UPDATE storage.buckets
  SET allowed_mime_types = ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
  WHERE id = 'document-templates'
    AND NOT (
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        = ANY(coalesce(allowed_mime_types, ARRAY[]::text[]))
    );
END
$$ LANGUAGE plpgsql;

-- 6) Aumenta limite de tamanho (DOCX com imagens pode ultrapassar 50MB do PDF legado)
UPDATE storage.buckets
SET file_size_limit = GREATEST(coalesce(file_size_limit, 0), 104857600)  -- 100MB
WHERE id = 'document-templates';

-- Nota: RLS policies do bucket ja existem (migration 0138) e funcionam para
-- DOCX porque filtram por clinic_id no path, sem checar content-type.
