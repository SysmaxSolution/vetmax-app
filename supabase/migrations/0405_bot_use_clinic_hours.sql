-- 0405_bot_use_clinic_hours.sql
-- Item 08:44 (Sprint Almavet) — bot pode seguir o horário de funcionamento da
-- clínica POR DIA DA SEMANA (clinics.business_hours), em vez de uma janela única.
-- Default false = mantém o comportamento atual (working_hours_start/end). Aditiva.

ALTER TABLE whatsapp_bot_config
  ADD COLUMN IF NOT EXISTS use_clinic_hours BOOLEAN NOT NULL DEFAULT false;
