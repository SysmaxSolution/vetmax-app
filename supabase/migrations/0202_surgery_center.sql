-- =============================================================================
-- VetMax — Migration 0202: Centro Cirúrgico (Fase 3)
--
-- Módulo independente (flag centro_cirurgico). Conteúdo:
--   1. surgeries — fluxo Preparo→Sala→RPA, checklist pré-op, ficha anestésica,
--      relatório cirúrgico, transição pós-op.
--   2. FK clinical_vitals.surgery_id → surgeries (coluna criada na 0196, agora
--      ganha a FK — ficha anestésica grava vitais com surgery_id).
--   3. service_kits / service_kit_items — Kits Cirúrgicos (insumos).
--   4. surgery_charges — fatura do paciente da cirurgia (kits/medicação/etc.).
-- Aditiva, IF NOT EXISTS, clinic_id em tudo.
-- =============================================================================

BEGIN;

-- ─── 1. surgeries ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS surgeries (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                 UUID         NOT NULL REFERENCES clinics(id)        ON DELETE CASCADE,
  patient_id                UUID         NOT NULL REFERENCES patients(id)       ON DELETE CASCADE,
  consultation_id           UUID         REFERENCES consultations(id)           ON DELETE SET NULL,
  room_id                   UUID         REFERENCES rooms(id)                   ON DELETE SET NULL,
  surgeon_id                UUID         REFERENCES profiles(id)                ON DELETE SET NULL,
  anesthetist_id            UUID         REFERENCES profiles(id)                ON DELETE SET NULL,
  procedure_name            TEXT         NOT NULL,
  status                    TEXT         NOT NULL DEFAULT 'preparo'
                                         CHECK (status IN ('preparo','sala','rpa','done','canceled')),
  asa_risk                  TEXT,        -- ASA I..V
  -- {fasting_confirmed, preop_exams_ok, consent_signed, consent_doc_id}
  checklist                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
  surgical_report           TEXT,
  started_at                TIMESTAMPTZ,
  ended_at                  TIMESTAMPTZ,
  postop_hospitalization_id UUID         REFERENCES hospitalizations(id)        ON DELETE SET NULL,
  notes                     TEXT,
  created_by                UUID         REFERENCES profiles(id)                ON DELETE SET NULL,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surgeries_clinic  ON surgeries (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_surgeries_patient ON surgeries (patient_id);

ALTER TABLE surgeries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_surgeries" ON surgeries;
CREATE POLICY "clinic_isolation_surgeries"
  ON surgeries FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE surgeries IS 'Centro Cirúrgico (Fase 3): fluxo Preparo→Sala→RPA, ficha em acordeão, transição pós-op.';

-- ─── 2. FK clinical_vitals.surgery_id ────────────────────────────────────────
-- A coluna surgery_id já existe (0196) sem FK (surgeries ainda não existia).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_vitals_surgery_fk') THEN
    ALTER TABLE clinical_vitals
      ADD CONSTRAINT clinical_vitals_surgery_fk
      FOREIGN KEY (surgery_id) REFERENCES surgeries(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ─── 3. service_kits / service_kit_items ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_kits (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by  UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_kit_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID          NOT NULL REFERENCES clinics(id)     ON DELETE CASCADE,
  kit_id        UUID          NOT NULL REFERENCES service_kits(id) ON DELETE CASCADE,
  stock_item_id UUID          REFERENCES stock_items(id) ON DELETE SET NULL,
  item_name     TEXT          NOT NULL,
  quantity      NUMERIC(12,3) NOT NULL DEFAULT 1,
  sort_order    INTEGER       NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_service_kits_clinic ON service_kits (clinic_id, is_active);
CREATE INDEX IF NOT EXISTS idx_service_kit_items   ON service_kit_items (kit_id, sort_order);

ALTER TABLE service_kits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_kit_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_service_kits" ON service_kits;
CREATE POLICY "clinic_isolation_service_kits"
  ON service_kits FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "clinic_isolation_service_kit_items" ON service_kit_items;
CREATE POLICY "clinic_isolation_service_kit_items"
  ON service_kit_items FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ─── 4. surgery_charges ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS surgery_charges (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID          NOT NULL REFERENCES clinics(id)   ON DELETE CASCADE,
  surgery_id  UUID          NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
  kind        TEXT          NOT NULL CHECK (kind IN ('kit','medication','procedure','other')),
  description TEXT          NOT NULL,
  quantity    NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status      TEXT          NOT NULL DEFAULT 'open' CHECK (status IN ('open','transferred','paid','void')),
  source_ref  UUID,
  created_by  UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surgery_charges ON surgery_charges (surgery_id, status);

ALTER TABLE surgery_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_surgery_charges" ON surgery_charges;
CREATE POLICY "clinic_isolation_surgery_charges"
  ON surgery_charges FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE surgery_charges IS 'Fatura do paciente da cirurgia (kits, medicações, procedimentos). Transferível p/ a Conta da Internação no pós-op.';

COMMIT;
