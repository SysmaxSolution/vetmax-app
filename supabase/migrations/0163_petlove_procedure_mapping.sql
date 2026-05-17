-- =============================================================================
-- VetMax — Migration 0163: petlove_procedure_mappings
-- Sprint 1 (Petlove Reconciliation) — Tradutor de nomenclatura.
--
-- Mapeia o nome do procedimento como vem na planilha Petlove (ex:
-- "Consulta Clínico Geral") para o item correspondente em stock_items
-- da clínica (que após a Migration 0100 unifica serviços e produtos).
--
-- O motor de matching usa last_seen_value como expected_value no
-- momento do lançamento — resolve o problema dos valores variáveis
-- sem depender da próxima planilha.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS petlove_procedure_mappings (
  id                       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                UUID           NOT NULL REFERENCES clinics(id)             ON DELETE CASCADE,
  provider_id              UUID           NOT NULL REFERENCES insurance_providers(id) ON DELETE CASCADE,

  external_procedure_name  TEXT           NOT NULL,
  internal_stock_item_id   UUID           REFERENCES stock_items(id) ON DELETE SET NULL,
  internal_label_alias     TEXT,

  last_seen_value          NUMERIC(10,2),
  average_value            NUMERIC(10,2),
  observation_count        INTEGER        NOT NULL DEFAULT 0,
  is_auto_learned          BOOLEAN        NOT NULL DEFAULT false,

  created_at               TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ    NOT NULL DEFAULT now(),

  UNIQUE (clinic_id, provider_id, external_procedure_name)
);

CREATE INDEX IF NOT EXISTS idx_petlove_proc_map_clinic
  ON petlove_procedure_mappings (clinic_id);

CREATE INDEX IF NOT EXISTS idx_petlove_proc_map_provider
  ON petlove_procedure_mappings (clinic_id, provider_id);

ALTER TABLE petlove_procedure_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_petlove_proc_map" ON petlove_procedure_mappings;
CREATE POLICY "clinic_isolation_petlove_proc_map"
  ON petlove_procedure_mappings FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE petlove_procedure_mappings IS
  'Tradutor entre nome de procedimento na planilha Petlove e stock_items (is_service=true) da clínica. last_seen_value alimenta expected_value no lançamento.';

COMMIT;
