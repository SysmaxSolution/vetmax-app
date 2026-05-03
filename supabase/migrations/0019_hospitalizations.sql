-- Sprint: Hospitalization Kanban
-- Cria tabela de internações/hospitalização veterinária

CREATE TABLE IF NOT EXISTS hospitalizations (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id        UUID        NOT NULL REFERENCES clinics(id)       ON DELETE CASCADE,
  patient_id       UUID        NOT NULL REFERENCES patients(id)      ON DELETE CASCADE,
  consultation_id  UUID                 REFERENCES consultations(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'observation'
    CHECK (status IN ('observation', 'ward', 'icu', 'ready_for_discharge', 'discharged')),
  reason           TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ          DEFAULT NOW(),
  discharged_at    TIMESTAMPTZ
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_hospitalizations_clinic_status
  ON hospitalizations (clinic_id, status);

CREATE INDEX IF NOT EXISTS idx_hospitalizations_patient
  ON hospitalizations (patient_id);

CREATE INDEX IF NOT EXISTS idx_hospitalizations_consultation
  ON hospitalizations (consultation_id);

-- Row Level Security — isolamento multi-tenant
ALTER TABLE hospitalizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation"
  ON hospitalizations
  FOR ALL
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );


ALTER TABLE hospitalization_records DROP COLUMN medications;
ALTER TABLE hospitalization_records ADD COLUMN medications JSONB DEFAULT '[]'::jsonb;

-- Garante que o RLS está ativado
ALTER TABLE hospitalization_records ENABLE ROW LEVEL SECURITY;

-- Apaga a política antiga se existir para evitar conflitos
DROP POLICY IF EXISTS "Permitir leitura de evolucoes" ON hospitalization_records;

-- Cria a política permitindo que usuários vejam as evoluções da sua clínica
CREATE POLICY "Permitir leitura de evolucoes"
ON hospitalization_records FOR SELECT TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id FROM profiles WHERE profiles.id = auth.uid()
  )
);