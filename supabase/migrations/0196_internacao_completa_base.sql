-- =============================================================================
-- VetMax — Migration 0196: Base da Sprint "Internação Completa" + Centro Cirúrgico
--
-- Aditiva e idempotente (IF NOT EXISTS). Não altera o fluxo atual: as features
-- só aparecem quando as flags clinics.flow_config.internacao_completa /
-- centro_cirurgico estiverem TRUE (gate em runtime; sem migration p/ as flags).
--
-- Conteúdo:
--   1. Enriquecimento da tabela hospitalizations (ficha + leito + isolamento).
--   2. clinical_vitals — sinais vitais ESTRUTURADOS, compartilhada entre
--      Internação (hospitalization_id) e Centro Cirúrgico (surgery_id). Pronta
--      para integração futura com monitores IoT (source/device_id).
-- =============================================================================

BEGIN;

-- ─── 1. hospitalizations: ficha enriquecida + leito + isolamento ────────────

ALTER TABLE hospitalizations
  ADD COLUMN IF NOT EXISTS box_id              UUID        REFERENCES rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimated_discharge TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS weight_at_admission NUMERIC(7,3),
  ADD COLUMN IF NOT EXISTS attending_vet_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS personal_belongings TEXT,
  ADD COLUMN IF NOT EXISTS diet_notes          TEXT,
  ADD COLUMN IF NOT EXISTS fasting             BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Regra 2 — risco biológico: card ganha contorno forte no Kanban / Mapa de Execução.
  ADD COLUMN IF NOT EXISTS isolation_required  BOOLEAN     NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN hospitalizations.box_id              IS 'Leito/box (rooms.type=hospitalization) alocado ao paciente.';
COMMENT ON COLUMN hospitalizations.estimated_discharge IS 'Previsão de alta (ficha de internação).';
COMMENT ON COLUMN hospitalizations.weight_at_admission IS 'Peso (kg) registrado na admissão — base p/ cálculo de doses/fluidoterapia.';
COMMENT ON COLUMN hospitalizations.isolation_required  IS 'Risco biológico: exige EPI. Destaque visual vermelho/âmbar no Kanban e Mapa de Execução.';

CREATE INDEX IF NOT EXISTS idx_hospitalizations_box
  ON hospitalizations (box_id) WHERE box_id IS NOT NULL;

-- ─── 2. clinical_vitals (compartilhada Internação × Cirurgia) ───────────────

CREATE TABLE IF NOT EXISTS clinical_vitals (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- Exatamente UM dos dois vínculos é preenchido (XOR). surgery_id fica sem FK
  -- até a tabela surgeries existir (Fase 3) — a FK é adicionada lá.
  hospitalization_id UUID         REFERENCES hospitalizations(id) ON DELETE CASCADE,
  surgery_id         UUID,

  recorded_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  recorded_by        UUID         REFERENCES profiles(id) ON DELETE SET NULL,

  -- Parâmetros clínicos (todos opcionais — registra-se o que houver).
  temperature        NUMERIC(4,1),   -- °C
  heart_rate         INTEGER,        -- bpm
  resp_rate          INTEGER,        -- mpm
  weight             NUMERIC(7,3),   -- kg
  blood_pressure     TEXT,           -- "120/80" (sistólica/diastólica)
  glucose            NUMERIC(6,2),   -- mg/dL
  spo2               NUMERIC(5,2),   -- %
  mucosa             TEXT,           -- coloração de mucosas
  tpc_seconds        NUMERIC(4,1),   -- tempo de preenchimento capilar (s)
  hydration_pct      NUMERIC(5,2),   -- % de desidratação estimada
  pain_score         INTEGER,        -- escala de dor
  notes              TEXT,

  -- Preparação IoT: hoje 'manual'/'voice'; 'iot' p/ monitores futuros.
  source             TEXT         NOT NULL DEFAULT 'manual'
                                   CHECK (source IN ('manual', 'voice', 'iot')),
  device_id          TEXT,

  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT clinical_vitals_one_owner CHECK (num_nonnulls(hospitalization_id, surgery_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_clinical_vitals_hosp
  ON clinical_vitals (hospitalization_id, recorded_at DESC) WHERE hospitalization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_vitals_surgery
  ON clinical_vitals (surgery_id, recorded_at DESC) WHERE surgery_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_vitals_clinic
  ON clinical_vitals (clinic_id);

ALTER TABLE clinical_vitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_clinical_vitals" ON clinical_vitals;
CREATE POLICY "clinic_isolation_clinical_vitals"
  ON clinical_vitals FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE clinical_vitals IS
  'Sinais vitais estruturados, compartilhados entre Internação (hospitalization_id) e Centro Cirúrgico (surgery_id). XOR garantido por CHECK. source/device_id preparam integração IoT futura.';

COMMIT;
