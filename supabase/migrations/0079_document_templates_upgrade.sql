-- =============================================================================
-- VetMax — Migration 0079: Upgrade document_templates + patient_documents
-- Adiciona suporte a layout visual (template_html), colunas faltantes em
-- patient_documents, e torna template_id nullable para system templates.
-- =============================================================================

-- 1. Adicionar template_html em document_templates (armazena HTML do layout original)
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS template_html text;

-- 2. Tornar template_id nullable em patient_documents (system templates não existem no DB)
ALTER TABLE patient_documents
  ALTER COLUMN template_id DROP NOT NULL;

-- 3. Remover FK constraint restritiva e recriar como nullable
ALTER TABLE patient_documents
  DROP CONSTRAINT IF EXISTS patient_documents_template_id_fkey;

ALTER TABLE patient_documents
  ADD CONSTRAINT patient_documents_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES document_templates(id)
    ON DELETE SET NULL;

-- 4. Adicionar colunas denormalizadas em patient_documents
--    (permitem reabrir/reimprimir sem depender do template original)
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS template_name             text,
  ADD COLUMN IF NOT EXISTS template_type             text,
  ADD COLUMN IF NOT EXISTS template_extracted_fields  jsonb,
  ADD COLUMN IF NOT EXISTS template_html             text;

-- 5. Índice para busca por tipo de template
CREATE INDEX IF NOT EXISTS idx_patient_documents_template_type
  ON patient_documents(template_type);
