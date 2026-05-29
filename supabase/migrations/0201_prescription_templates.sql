-- =============================================================================
-- VetMax — Migration 0201: Protocolos de Prescrição (Fase 2)
--
-- Modelos reutilizáveis de prescrição (ex.: "Analgesia Pós-Op", "Parvovirose").
-- O ProtocolPicker aplica o protocolo num paciente fazendo o unroll dos itens
-- em hospitalization_prescriptions (1 clique → várias prescrições no Mapa de
-- Execução). Aditiva, IF NOT EXISTS, clinic_id em tudo.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS prescription_templates (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by  UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prescription_template_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         UUID          NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  template_id       UUID          NOT NULL REFERENCES prescription_templates(id) ON DELETE CASCADE,
  medication_name   TEXT          NOT NULL,
  dose              TEXT,
  route             TEXT,
  -- 4/6/8/12/24/48 ou NULL (dose única / SOS).
  frequency_hours   NUMERIC(6,2),
  -- duração total do ciclo em horas (NULL = até a alta).
  duration_hours    NUMERIC(8,2),
  notes             TEXT,
  -- vínculo opcional com estoque (baixa automática ao aplicar a dose).
  stock_item_id     UUID          REFERENCES stock_items(id) ON DELETE SET NULL,
  quantity_per_dose NUMERIC(12,3),
  sort_order        INTEGER       NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presc_templates_clinic ON prescription_templates (clinic_id, is_active);
CREATE INDEX IF NOT EXISTS idx_presc_template_items   ON prescription_template_items (template_id, sort_order);

ALTER TABLE prescription_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_presc_templates" ON prescription_templates;
CREATE POLICY "clinic_isolation_presc_templates"
  ON prescription_templates FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "clinic_isolation_presc_template_items" ON prescription_template_items;
CREATE POLICY "clinic_isolation_presc_template_items"
  ON prescription_template_items FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE prescription_templates IS
  'Protocolos de prescrição reutilizáveis (Fase 2). Aplicados a uma internação via unroll em hospitalization_prescriptions.';

COMMIT;
