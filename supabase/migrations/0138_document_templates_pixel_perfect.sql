-- =============================================================================
-- VetMax — Migration 0138: Pixel Perfect Templates
-- Operação Pixel Perfect — Padrão DocuSign (Overlay Engine)
--
-- Adiciona suporte a:
--   1. PDF original armazenado em Storage (imutável, sem perda de qualidade)
--   2. Dimensões de página em PDF points (para conversão de coordenadas exata)
--   3. Layout overlays unificados (% por página) — fonte da verdade para preview/editor/geração
--   4. Paths de Storage para imagens de página (alternativa ao JSONB para PDFs grandes)
--   5. PDF gerado por paciente em Storage + overlay_values aplicados
-- =============================================================================

-- ── document_templates: PDF original + layout pixel-perfect ─────────────────

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS original_pdf_path text,            -- bucket: document-templates
  ADD COLUMN IF NOT EXISTS original_pdf_size_bytes integer,
  ADD COLUMN IF NOT EXISTS page_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS page_dimensions jsonb,             -- [{width_pt, height_pt}, ...]
  ADD COLUMN IF NOT EXISTS layout_overlays jsonb,             -- snapshot do layout salvo (overlays + page)
  ADD COLUMN IF NOT EXISTS page_images_storage_paths text[];  -- alternativa a page_images (JSONB) p/ PDFs grandes

COMMENT ON COLUMN document_templates.original_pdf_path IS
  'Path do PDF original no bucket document-templates: {clinic_id}/{template_id}/original.pdf';
COMMENT ON COLUMN document_templates.page_dimensions IS
  'Array por página: [{width_pt: 595.28, height_pt: 841.89}, ...] em PDF points (A4 padrão)';
COMMENT ON COLUMN document_templates.layout_overlays IS
  'Array de overlays salvos no editor: [{id, type, field_name, page, x_pct, y_pct, w_pct, h_pct, font_size, font_weight, font_family, text_align, color, content}]';

-- ── patient_documents: PDF gerado + valores preenchidos ─────────────────────

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS generated_pdf_path text,           -- bucket: patient-documents
  ADD COLUMN IF NOT EXISTS overlay_values jsonb,              -- {field_name: value} usado na geração
  ADD COLUMN IF NOT EXISTS generated_at timestamptz DEFAULT now();

COMMENT ON COLUMN patient_documents.generated_pdf_path IS
  'Path do PDF preenchido em patient-documents: {clinic_id}/{patient_id}/{document_id}.pdf';

-- ── Índices para queries de geração ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_document_templates_has_original_pdf
  ON document_templates(clinic_id) WHERE original_pdf_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_documents_generated
  ON patient_documents(patient_id, generated_at DESC) WHERE generated_pdf_path IS NOT NULL;

-- ── Storage buckets ─────────────────────────────────────────────────────────
-- Criados como privados; acesso via signed URLs ou RLS abaixo.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('document-templates', 'document-templates', false, 52428800,  -- 50MB max por PDF
    ARRAY['application/pdf']::text[]),
  ('patient-documents', 'patient-documents', false, 26214400,    -- 25MB max por PDF gerado
    ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO NOTHING;

-- ── RLS Storage: isolamento por clinic_id (primeiro segmento do path) ───────

-- Templates: leitura por membros da clínica
DROP POLICY IF EXISTS "tpl_storage_read_clinic" ON storage.objects;
CREATE POLICY "tpl_storage_read_clinic"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'document-templates'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- Templates: escrita/atualização/delete apenas admin da clínica
DROP POLICY IF EXISTS "tpl_storage_write_admin" ON storage.objects;
CREATE POLICY "tpl_storage_write_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'document-templates'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "tpl_storage_update_admin" ON storage.objects;
CREATE POLICY "tpl_storage_update_admin"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'document-templates'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "tpl_storage_delete_admin" ON storage.objects;
CREATE POLICY "tpl_storage_delete_admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'document-templates'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Patient documents: leitura por membros da clínica
DROP POLICY IF EXISTS "pdoc_storage_read_clinic" ON storage.objects;
CREATE POLICY "pdoc_storage_read_clinic"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'patient-documents'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- Patient documents: escrita por qualquer membro da clínica (vet/aux/admin)
DROP POLICY IF EXISTS "pdoc_storage_write_clinic" ON storage.objects;
CREATE POLICY "pdoc_storage_write_clinic"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'patient-documents'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pdoc_storage_delete_admin" ON storage.objects;
CREATE POLICY "pdoc_storage_delete_admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'patient-documents'
    AND (storage.foldername(name))[1] = (
      SELECT clinic_id::text FROM profiles WHERE id = auth.uid()
    )
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
