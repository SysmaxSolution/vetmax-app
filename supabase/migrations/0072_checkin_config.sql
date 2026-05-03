-- =============================================================================
-- VetMax — Migration 0072: Check-in Campos Configuráveis
-- Permite que cada clínica defina quais campos do check-in são obrigatórios.
-- =============================================================================

-- JSONB array com nomes dos campos obrigatórios
-- Ex: ["address", "emergency_contact", "weight"]
-- Se vazio [], nenhum campo extra é obrigatório além de visit_reason
ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS checkin_required_fields jsonb NOT NULL DEFAULT '["address", "emergency_contact"]'::jsonb;

COMMENT ON COLUMN clinic_settings.checkin_required_fields
  IS 'Array JSON com nomes dos campos obrigatórios no check-in. Default: address + emergency_contact';

-- ROLLBACK:
-- ALTER TABLE clinic_settings DROP COLUMN IF EXISTS checkin_required_fields;
