-- 0359_attachment_metadata_fields.sql
-- Adiciona campos opcionais de metadados em todas as tabelas de anexo/documento:
--   • title          → título do documento (livre, ex.: "Receita Domperidona")
--   • document_date  → data do documento (manual, distinta de created_at)
--   • notes          → observação livre
-- Exibidos apenas quando preenchidos. Editáveis após o upload.

ALTER TABLE patient_attachments
  ADD COLUMN IF NOT EXISTS title         TEXT,
  ADD COLUMN IF NOT EXISTS document_date DATE,
  ADD COLUMN IF NOT EXISTS notes         TEXT;

ALTER TABLE hospitalization_documents
  ADD COLUMN IF NOT EXISTS title         TEXT,
  ADD COLUMN IF NOT EXISTS document_date DATE,
  ADD COLUMN IF NOT EXISTS notes         TEXT;

ALTER TABLE grooming_documents
  ADD COLUMN IF NOT EXISTS title         TEXT,
  ADD COLUMN IF NOT EXISTS document_date DATE,
  ADD COLUMN IF NOT EXISTS notes         TEXT;
