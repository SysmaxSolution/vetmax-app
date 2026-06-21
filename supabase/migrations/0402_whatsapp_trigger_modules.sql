-- 0402_whatsapp_trigger_modules.sql
-- M8 (Sprint Almavet) — governança de gatilhos por módulo.
-- Lista de MÓDULOS cujos gatilhos de WhatsApp estão DESLIGADos para a clínica
-- (ex.: clínica quer enviar na internação mas não no consultório).
-- Vazio = todos os módulos disparam (comportamento atual). Aditiva e idempotente.

ALTER TABLE clinic_whatsapp_settings
  ADD COLUMN IF NOT EXISTS disabled_trigger_modules TEXT[] NOT NULL DEFAULT '{}';
