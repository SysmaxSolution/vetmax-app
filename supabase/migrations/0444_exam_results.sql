-- 0444 — Resultados de exame (Fase 2 · fundação do laboratório).
-- Uma linha por analito de um exame (consulta). Preenchida manualmente hoje e,
-- futuramente, pelo interfaceamento dos aparelhos (HL7). O MV confere e LIBERA
-- (item 2.4) antes de o resultado ir ao laudo/tutor. Aditiva + idempotente.

CREATE TABLE IF NOT EXISTS exam_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  panel           text,                 -- ex.: "Hemograma", "Bioquímico"
  analyte_code    text,                 -- código do aparelho/LOINC (quando houver)
  analyte_name    text NOT NULL,        -- ex.: "Hemácias", "Creatinina"
  value_text      text NOT NULL,        -- valor (numérico ou descritivo)
  unit            text,
  ref_low         numeric,
  ref_high        numeric,
  ref_text        text,                 -- faixa de referência textual
  flag            text CHECK (flag IN ('H','L','N','A') OR flag IS NULL), -- High/Low/Normal/Anormal
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','released')),
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','hl7','lab_partner')),
  created_by      uuid,
  released_by     uuid,
  released_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_results_consultation ON exam_results (consultation_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_clinic ON exam_results (clinic_id);

ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'exam_results' AND policyname = 'exam_results_tenant') THEN
    CREATE POLICY exam_results_tenant ON exam_results
      USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;
