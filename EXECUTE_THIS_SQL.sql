-- ============================================
-- MIGRATION: Document Templates Table
-- Execute this in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('laudo', 'receita', 'encaminhamento', 'termo', 'exame', 'outro')),
  file_url TEXT,
  extracted_fields JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ativar RLS (Row Level Security)
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_document_templates_clinic_id ON document_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_type ON document_templates(type);

-- RLS Policy: Isolamento por clínica
CREATE POLICY IF NOT EXISTS "clinic_isolation_document_templates"
  ON document_templates FOR ALL
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- RLS Policy: Admin pode fazer operações
CREATE POLICY IF NOT EXISTS "admin_manage_templates"
  ON document_templates FOR ALL
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
