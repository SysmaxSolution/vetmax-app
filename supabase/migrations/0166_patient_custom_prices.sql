-- =============================================================================
-- VetMax — Migration 0166: patient_custom_prices
-- Sprint 4 refatorada — Matriz de preços customizada por pet × procedimento.
--
-- Cada linha grava o último preço REALIZADO do convênio (Petlove) para
-- aquele pet naquele procedimento/serviço. Quando a recepção abrir o
-- cadastro do pet ou iniciar um novo atendimento, o sistema lê esta
-- matriz e sugere o preço exato do contrato anual do tutor.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS patient_custom_prices (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID          NOT NULL REFERENCES clinics(id)        ON DELETE CASCADE,
  patient_id         UUID          NOT NULL REFERENCES patients(id)       ON DELETE CASCADE,
  stock_item_id      UUID          NOT NULL REFERENCES stock_items(id)    ON DELETE CASCADE,

  custom_price       NUMERIC(10,2) NOT NULL CHECK (custom_price >= 0),
  source             TEXT          NOT NULL DEFAULT 'manual'
                                   CHECK (source IN ('manual', 'petlove_remittance', 'other_insurance')),
  provider_id        UUID          REFERENCES insurance_providers(id)     ON DELETE SET NULL,

  last_remittance_id UUID          REFERENCES petlove_remittances(id)     ON DELETE SET NULL,
  last_seen_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  observation_count  INTEGER       NOT NULL DEFAULT 1,

  notes              TEXT,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE (clinic_id, patient_id, stock_item_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_custom_prices_clinic
  ON patient_custom_prices (clinic_id);

CREATE INDEX IF NOT EXISTS idx_patient_custom_prices_patient
  ON patient_custom_prices (clinic_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_custom_prices_stock_item
  ON patient_custom_prices (clinic_id, stock_item_id);

ALTER TABLE patient_custom_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_patient_custom_prices" ON patient_custom_prices;
CREATE POLICY "clinic_isolation_patient_custom_prices"
  ON patient_custom_prices FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE patient_custom_prices IS
  'Matriz de preço customizado [patient × stock_item]. Origem padrão: planilha Petlove. Lida pela recepção para sugerir o preço exato do contrato no próximo atendimento.';

COMMIT;
