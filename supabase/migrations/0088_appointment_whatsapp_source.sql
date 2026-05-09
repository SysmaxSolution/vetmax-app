-- ============================================================
-- 0088_appointment_whatsapp_source
-- Rastreia a origem dos agendamentos (manual, whatsapp, etc.)
-- ============================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_appointments_source
  ON appointments (clinic_id, source);

-- ROLLBACK: ALTER TABLE appointments DROP COLUMN IF EXISTS source;
