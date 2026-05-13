-- Intervalo padrão entre consultas por profissional (minutos)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS appointment_interval_minutes integer NOT NULL DEFAULT 60;
