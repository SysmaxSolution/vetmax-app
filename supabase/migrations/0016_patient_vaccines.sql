-- ─── patient_vaccines ────────────────────────────────────────────────────────
-- Histórico de vacinação por pet, com controle de próxima dose.

CREATE TABLE IF NOT EXISTS patient_vaccines (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id         UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id        UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  vaccine_name      TEXT        NOT NULL,
  date_administered DATE        NOT NULL DEFAULT CURRENT_DATE,
  next_due_date     DATE,
  administered_by   UUID        REFERENCES profiles(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS patient_vaccines_clinic_id_idx   ON patient_vaccines (clinic_id);
CREATE INDEX IF NOT EXISTS patient_vaccines_patient_id_idx  ON patient_vaccines (patient_id);
CREATE INDEX IF NOT EXISTS patient_vaccines_next_due_idx    ON patient_vaccines (next_due_date);

-- RLS
ALTER TABLE patient_vaccines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_members_select_vaccines" ON patient_vaccines
  FOR SELECT USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "clinic_members_insert_vaccines" ON patient_vaccines
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "clinic_members_delete_vaccines" ON patient_vaccines
  FOR DELETE USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );
