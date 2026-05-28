-- =============================================================================
-- VetMax — Migration 0199: Balanço hídrico da Internação (Regra 3)
--
-- Registra ENTRADAS (fluidoterapia) e SAÍDAS (urina/êmese/sangramento/outros)
-- em mL. A aba Fluidoterapia calcula o Saldo Hídrico = Entradas − Saídas para o
-- MV avaliar hiper-hidratação. Aditiva, IF NOT EXISTS, clinic_id em tudo.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS hospitalization_fluid_balance (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID         NOT NULL REFERENCES clinics(id)          ON DELETE CASCADE,
  hospitalization_id UUID         NOT NULL REFERENCES hospitalizations(id) ON DELETE CASCADE,
  direction          TEXT         NOT NULL CHECK (direction IN ('in', 'out')),
  kind               TEXT         NOT NULL CHECK (kind IN ('fluid', 'urine', 'emesis', 'bleeding', 'other')),
  volume_ml          NUMERIC(10,2) NOT NULL CHECK (volume_ml >= 0),
  recorded_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  recorded_by        UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  notes              TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fluid_balance_hosp
  ON hospitalization_fluid_balance (hospitalization_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fluid_balance_clinic
  ON hospitalization_fluid_balance (clinic_id);

ALTER TABLE hospitalization_fluid_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_fluid_balance" ON hospitalization_fluid_balance;
CREATE POLICY "clinic_isolation_fluid_balance"
  ON hospitalization_fluid_balance FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE hospitalization_fluid_balance IS
  'Balanço hídrico da internação (Regra 3): entradas (fluidoterapia) e saídas (urina/êmese/sangramento) em mL. Saldo = SUM(in) − SUM(out).';

COMMIT;
