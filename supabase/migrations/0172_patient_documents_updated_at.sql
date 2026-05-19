-- =============================================================================
-- VetMax — Migration 0172: patient_documents.updated_at
--
-- Coluna para rastrear última edição de um documento gerado.
-- Necessária para o fluxo de Editar Documento no consultório
-- (CanvasDocumentDraftModal modo edit + updateCanvaPatientDocument).
--
-- Estratégia aditiva: default now() preenche linhas existentes.
-- =============================================================================

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Índice opcional para listagens ordenadas por última edição
CREATE INDEX IF NOT EXISTS idx_patient_documents_clinic_updated
  ON patient_documents(clinic_id, updated_at DESC);
