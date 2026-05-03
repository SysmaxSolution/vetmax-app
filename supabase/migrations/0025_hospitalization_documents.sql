-- Sprint: Central de Documentos para Internação
-- Bucket `clinical-documents` (segue padrão de 0013_patient_attachments)

-- ─── 1. Bucket de Storage ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-documents',
  'clinical-documents',
  false,
  52428800,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Políticas de Storage (isolamento por clinic_id no path) ───────────────
DROP POLICY IF EXISTS "clinical_docs_upload"  ON storage.objects;
CREATE POLICY "clinical_docs_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'clinical-documents'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'))[1] = (
      SELECT clinic_id::text FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "clinical_docs_select" ON storage.objects;
CREATE POLICY "clinical_docs_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'clinical-documents'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'))[1] = (
      SELECT clinic_id::text FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS "clinical_docs_delete" ON storage.objects;
CREATE POLICY "clinical_docs_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'clinical-documents'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'))[1] = (
      SELECT clinic_id::text FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- ─── 3. Tabela de Metadados ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hospitalization_documents (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id           UUID        NOT NULL REFERENCES clinics(id)          ON DELETE CASCADE,
  hospitalization_id  UUID        NOT NULL REFERENCES hospitalizations(id) ON DELETE CASCADE,
  file_name           TEXT        NOT NULL,
  file_type           TEXT        NOT NULL DEFAULT 'other',  -- 'pdf' | 'image' | 'other'
  storage_path        TEXT        NOT NULL,                  -- clinic_id/hosp_id/timestamp-filename
  user_id             UUID        REFERENCES auth.users(id)  ON DELETE SET NULL,
  user_name           TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hosp_docs_hospitalization
  ON hospitalization_documents (hospitalization_id);

CREATE INDEX IF NOT EXISTS idx_hosp_docs_clinic
  ON hospitalization_documents (clinic_id);

-- ─── 4. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE hospitalization_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosp_docs_select" ON hospitalization_documents FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "hosp_docs_insert" ON hospitalization_documents FOR INSERT
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "hosp_docs_delete" ON hospitalization_documents FOR DELETE
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));
