-- =============================================================================
-- VetMax — Migration 0207: Feed por Etapa do Centro Cirúrgico
--
-- Cada etapa do acordeão (pré-op / anestesia / relatório) ganha um feed
-- cronológico de anotações editáveis. Mesma mecânica imutável-mas-editável da
-- Internação: autor + carimbo + texto livre; pode editar/excluir os próprios
-- registros enquanto status da cirurgia <> 'done'/'canceled'.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS surgery_records (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID         NOT NULL REFERENCES clinics(id)  ON DELETE CASCADE,
  surgery_id  UUID         NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
  stage       TEXT         NOT NULL CHECK (stage IN ('preop','anesthesia','report')),
  notes       TEXT         NOT NULL,
  created_by  UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surgery_records_surgery_stage
  ON surgery_records (surgery_id, stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_surgery_records_clinic
  ON surgery_records (clinic_id);

ALTER TABLE surgery_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_surgery_records" ON surgery_records;
CREATE POLICY "clinic_isolation_surgery_records"
  ON surgery_records FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE surgery_records IS
  'Feed cronológico por etapa da cirurgia (preop/anesthesia/report). Autor pode editar/excluir os próprios enquanto a cirurgia não estiver finalizada.';

COMMIT;
