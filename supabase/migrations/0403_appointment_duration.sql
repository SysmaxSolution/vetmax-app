-- 0403_appointment_duration.sql
-- M4 (Sprint Almavet) — duração customizável por agendamento.
-- NULL = usa o intervalo padrão do profissional (profiles.appointment_interval_minutes).
-- Aditiva e idempotente.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
