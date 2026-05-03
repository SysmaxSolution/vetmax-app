-- =============================================================================
-- VetMax — Migration 0073: Triagem Sinais Vitais Configuráveis
-- Permite que cada clínica defina quais sinais vitais são obrigatórios.
-- =============================================================================

-- JSONB array com nomes dos campos obrigatórios na triagem
-- Ex: ["weight", "temperature", "chief_complaint"]
-- Default mantém o comportamento atual (peso + temperatura + queixa obrigatórios)
ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS triage_required_fields jsonb NOT NULL DEFAULT '["weight", "temperature", "chief_complaint"]'::jsonb;

COMMENT ON COLUMN clinic_settings.triage_required_fields
  IS 'Array JSON com sinais vitais obrigatórios na triagem. Default: weight, temperature, chief_complaint';

-- ROLLBACK:
-- ALTER TABLE clinic_settings DROP COLUMN IF EXISTS triage_required_fields;
