-- =============================================================================
-- VetMax — Migration 0082: page_images para templates
-- Armazena imagens base64 das paginas do documento original importado
-- =============================================================================

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS page_images jsonb;

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS page_images jsonb;
