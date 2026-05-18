-- =============================================================================
-- VetMax — Migration 0158: patient-documents bucket aceita DOCX (fallback)
--
-- Quando Gotenberg falha na conversao DOCX -> PDF, o fallback silencioso
-- entrega o .docx editavel ao usuario. O bucket precisa aceitar esse mime.
--
-- Tambem adiciona coluna `generated_format` em patient_documents para
-- distinguir o formato final entregue (pdf | docx). Default 'pdf' para
-- nao quebrar registros existentes.
--
-- IDEMPOTENTE: aditiva com IF NOT EXISTS.
-- =============================================================================

-- 1) Coluna generated_format
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS generated_format text NOT NULL DEFAULT 'pdf';

COMMENT ON COLUMN patient_documents.generated_format IS
  'Formato do arquivo final em generated_pdf_path: pdf (Gotenberg ok) ou docx (fallback silencioso).';

-- 2) Permitir DOCX no bucket patient-documents
DO $$
BEGIN
  UPDATE storage.buckets
  SET allowed_mime_types = ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
  WHERE id = 'patient-documents'
    AND NOT (
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        = ANY(coalesce(allowed_mime_types, ARRAY[]::text[]))
    );
END
$$ LANGUAGE plpgsql;

-- 3) Aumenta limite para acomodar templates DOCX gerados com imagens embutidas
UPDATE storage.buckets
SET file_size_limit = GREATEST(coalesce(file_size_limit, 0), 52428800)  -- 50MB
WHERE id = 'patient-documents';
