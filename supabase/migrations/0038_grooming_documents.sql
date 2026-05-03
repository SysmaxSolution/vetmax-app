-- =============================================================================
-- VetMax — Migration 0038: grooming_documents
-- Módulo Banho e Tosa — Documentos/fotos por sessão
-- =============================================================================

CREATE TABLE IF NOT EXISTS grooming_documents (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid          NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  clinic_id     uuid          NOT NULL REFERENCES clinics(id)           ON DELETE CASCADE,
  file_name     text          NOT NULL,
  file_type     text          NOT NULL CHECK (file_type IN ('image', 'pdf', 'other')),
  storage_path  text          NOT NULL,
  user_name     text          NOT NULL,
  created_by    uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_grooming_documents_session_id ON grooming_documents(session_id);
CREATE INDEX IF NOT EXISTS idx_grooming_documents_clinic_id  ON grooming_documents(clinic_id);

-- RLS
ALTER TABLE grooming_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_grooming_documents" ON grooming_documents;
CREATE POLICY "clinic_isolation_grooming_documents"
  ON grooming_documents FOR ALL TO authenticated
  USING  (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
