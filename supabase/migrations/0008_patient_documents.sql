-- =============================================================================
-- VetMax — Migration 0008: patient_documents
-- Documentos clínicos gerados para pacientes (laudos, receitas, etc.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_documents (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid         NOT NULL REFERENCES clinics(id)            ON DELETE CASCADE,
  patient_id       uuid         NOT NULL REFERENCES patients(id)           ON DELETE CASCADE,
  consultation_id  uuid         NOT NULL REFERENCES consultations(id)      ON DELETE CASCADE,
  template_id      uuid         NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  document_name    text         NOT NULL,
  content_data     jsonb        NOT NULL DEFAULT '{}',
  created_at       timestamptz  NOT NULL DEFAULT now()
);

-- Índices para queries comuns
CREATE INDEX IF NOT EXISTS idx_patient_documents_consultation
  ON patient_documents(consultation_id);

CREATE INDEX IF NOT EXISTS idx_patient_documents_patient
  ON patient_documents(patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_documents_clinic_created
  ON patient_documents(clinic_id, created_at DESC);

-- RLS — isolamento por clinic_id
ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_patient_documents" ON patient_documents;

CREATE POLICY "clinic_isolation_patient_documents"
  ON patient_documents
  FOR ALL
  TO authenticated
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );
