-- VetMax — Migration 0134: Horário de disparo diário da agenda por clínica
ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS daily_schedule_alert_time time DEFAULT NULL;
