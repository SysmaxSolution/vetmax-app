-- 0358 — Notas do pet (observação/óbito/outras) + estado falecido em patients
--
-- 1. Tabela patient_notes: notas livres + sensíveis (óbito é caso especial)
-- 2. Colunas em patients: deceased_at, deceased_cause, deceased_recorded_by
-- 3. RLS clinic-isolated em ambos
--
-- Regras:
--  - note_type='death' exige metadata.deceased_at preenchido (validado em app)
--  - Quando deceased_at preenche patients, NENHUMA notificação ao tutor deve
--    ser disparada — guard via app (não há trigger automático de WhatsApp)
--
-- Sprint 2026-06-03 — feature memorial + notas do pet.

BEGIN;

-- ─── 1. Notas do pet ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  note_type    TEXT NOT NULL DEFAULT 'observation'
    CHECK (note_type IN ('observation', 'death', 'clinical', 'behavior', 'other')),
  title        TEXT,
  content      TEXT NOT NULL,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_notes_patient    ON patient_notes (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_notes_clinic     ON patient_notes (clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_notes_type       ON patient_notes (note_type);

ALTER TABLE patient_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_notes_clinic_select ON patient_notes;
DROP POLICY IF EXISTS patient_notes_clinic_write  ON patient_notes;

CREATE POLICY patient_notes_clinic_select ON patient_notes
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY patient_notes_clinic_write ON patient_notes
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ─── 2. Estado falecido em patients ─────────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS deceased_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deceased_cause       TEXT,
  ADD COLUMN IF NOT EXISTS deceased_recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_deceased
  ON patients (clinic_id, deceased_at)
  WHERE deceased_at IS NOT NULL;

COMMIT;
