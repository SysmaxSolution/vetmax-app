-- ============================================================
-- 0086_whatsapp_evolution_api
-- Adiciona 'evolution-api' como provedor suportado
-- ============================================================

-- Expande o CHECK constraint para aceitar 'evolution-api'
ALTER TABLE clinic_whatsapp_settings
  DROP CONSTRAINT IF EXISTS clinic_whatsapp_settings_provider_name_check;

ALTER TABLE clinic_whatsapp_settings
  ADD CONSTRAINT clinic_whatsapp_settings_provider_name_check
    CHECK (provider_name IN ('z-api', 'sysmax', 'evolution-api'));
