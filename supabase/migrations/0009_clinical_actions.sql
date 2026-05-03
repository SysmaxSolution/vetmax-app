-- =============================================================================
-- VetMax — Migration 0009: clinical_actions
-- Medicações aplicadas em clínica + encaminhamentos / receitas externas
-- =============================================================================

-- ── Medicações Aplicadas ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applied_medications (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid         NOT NULL REFERENCES clinics(id)         ON DELETE CASCADE,
  consultation_id  uuid         NOT NULL REFERENCES consultations(id)   ON DELETE CASCADE,
  medication_name  text         NOT NULL,
  dosage           text,
  route            text         CHECK (route IN ('IV','IM','SC','oral','topical','other')),
  notes            text,
  administered_by  uuid         REFERENCES profiles(id)                 ON DELETE SET NULL,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applied_medications_consultation
  ON applied_medications(consultation_id);

CREATE INDEX IF NOT EXISTS idx_applied_medications_clinic_created
  ON applied_medications(clinic_id, created_at DESC);

ALTER TABLE applied_medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_applied_medications" ON applied_medications;

CREATE POLICY "clinic_isolation_applied_medications"
  ON applied_medications
  FOR ALL
  TO authenticated
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- ── Encaminhamentos e Receitas Externas ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals_and_external_rx (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid         NOT NULL REFERENCES clinics(id)         ON DELETE CASCADE,
  consultation_id  uuid         NOT NULL REFERENCES consultations(id)   ON DELETE CASCADE,
  type             text         NOT NULL CHECK (type IN ('exam_internal','exam_external','prescription_external')),
  description      text         NOT NULL,
  doctor_notes     text,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_consultation
  ON referrals_and_external_rx(consultation_id);

CREATE INDEX IF NOT EXISTS idx_referrals_clinic_created
  ON referrals_and_external_rx(clinic_id, created_at DESC);

ALTER TABLE referrals_and_external_rx ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_referrals" ON referrals_and_external_rx;

CREATE POLICY "clinic_isolation_referrals"
  ON referrals_and_external_rx
  FOR ALL
  TO authenticated
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );
