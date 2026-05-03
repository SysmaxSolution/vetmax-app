-- ─── Migration 0010: Sistema de Agendamentos ──────────────────────────────────
-- Cria a tabela appointments com isolamento multi-tenant e RLS

CREATE TABLE IF NOT EXISTS appointments (
  id                   UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id            UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  pet_id               UUID         NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tutor_id             UUID         NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  appointment_datetime TIMESTAMPTZ  NOT NULL,
  reason               TEXT         NOT NULL DEFAULT 'consultation',
  status               TEXT         NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'arrived')),
  notes                TEXT,
  created_by           UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_datetime
  ON appointments (clinic_id, appointment_datetime);

CREATE INDEX IF NOT EXISTS idx_appointments_pet
  ON appointments (pet_id, clinic_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Cada clínica só vê seus próprios agendamentos
CREATE POLICY "appointments_clinic_select" ON appointments
  FOR SELECT
  USING (
    clinic_id = (
      SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "appointments_clinic_insert" ON appointments
  FOR INSERT
  WITH CHECK (
    clinic_id = (
      SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "appointments_clinic_update" ON appointments
  FOR UPDATE
  USING (
    clinic_id = (
      SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "appointments_clinic_delete" ON appointments
  FOR DELETE
  USING (
    clinic_id = (
      SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );
