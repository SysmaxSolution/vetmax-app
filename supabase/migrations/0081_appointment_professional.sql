-- =============================================================================
-- VetMax — Migration 0081: Vínculo de Profissional no Agendamento
-- Permite associar um profissional (vet/assistant) ao agendamento.
-- =============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_professional
  ON appointments(professional_id, appointment_datetime);

-- ROLLBACK:
-- ALTER TABLE appointments DROP COLUMN IF EXISTS professional_id;
