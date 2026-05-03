-- ─── Migration 0013: Patient Attachments + Storage ───────────────────────────

-- 1. Bucket de armazenamento (privado, máx 50MB por arquivo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinic-attachments',
  'clinic-attachments',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas de Storage (RLS no bucket)
-- Upload: só na pasta do próprio clinic_id
CREATE POLICY "clinic_storage_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'clinic-attachments'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'))[1] = (
      SELECT clinic_id::text FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- Leitura: só da própria pasta
CREATE POLICY "clinic_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'clinic-attachments'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'))[1] = (
      SELECT clinic_id::text FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- Deleção: só da própria pasta
CREATE POLICY "clinic_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'clinic-attachments'
    AND auth.role() = 'authenticated'
    AND (string_to_array(name, '/'))[1] = (
      SELECT clinic_id::text FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- 3. Tabela de metadados dos anexos
CREATE TABLE IF NOT EXISTS patient_attachments (
  id              UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id      UUID         NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id UUID         REFERENCES consultations(id) ON DELETE SET NULL,
  file_name       TEXT         NOT NULL,
  file_type       TEXT         NOT NULL,
  file_url        TEXT         NOT NULL, -- storage path: clinic_id/patient_id/timestamp_filename
  uploaded_by     UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_patient    ON patient_attachments (patient_id, clinic_id);
CREATE INDEX IF NOT EXISTS idx_attachments_consult    ON patient_attachments (consultation_id);

-- 4. RLS na tabela de metadados
ALTER TABLE patient_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_select" ON patient_attachments FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "attachments_insert" ON patient_attachments FOR INSERT
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "attachments_delete" ON patient_attachments FOR DELETE
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));
