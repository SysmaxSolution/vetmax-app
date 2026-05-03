-- =============================================================================
-- VetMax — Migration 0071: Agendamento Imediato
-- Permite que clínicas habilitem agendamento "imediato" sem trava de horário.
-- =============================================================================

-- Flag na tabela clinic_settings (criada em 0055)
ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS allow_immediate_booking boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN clinic_settings.allow_immediate_booking
  IS 'Quando true, permite agendamento imediato sem validação de horário comercial';

-- ROLLBACK:
-- ALTER TABLE clinic_settings DROP COLUMN IF EXISTS allow_immediate_booking;
