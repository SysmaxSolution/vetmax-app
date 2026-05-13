-- Adiciona coluna groomer_id à tabela grooming_sessions
ALTER TABLE grooming_sessions
  ADD COLUMN IF NOT EXISTS groomer_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_grooming_sessions_groomer
  ON grooming_sessions(groomer_id, clinic_id);
