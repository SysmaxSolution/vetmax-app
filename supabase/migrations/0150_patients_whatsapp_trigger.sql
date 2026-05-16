-- =============================================================================
-- VetMax — Migration 0150: Gatilho WhatsApp Individual por Paciente
--
-- Adiciona whatsapp_trigger_days em patients para permitir retornos
-- individualizados (ex: Snow a cada 15 dias, Rex a cada 30 dias).
-- NULL = usa o padrão global da clínica.
-- =============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS whatsapp_trigger_days INTEGER
  CONSTRAINT patients_whatsapp_trigger_days_check CHECK (whatsapp_trigger_days > 0 AND whatsapp_trigger_days <= 365);

COMMENT ON COLUMN patients.whatsapp_trigger_days IS
  'Dias entre envios de WhatsApp de retorno. NULL = padrão global da clínica.';
