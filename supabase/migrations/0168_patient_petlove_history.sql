-- =============================================================================
-- VetMax — Migration 0168: patient_petlove_history
-- Log auditável de eventos vindos da conciliação Petlove por pet:
--   - patient_created      pet/tutor criados via bulk register
--   - plan_updated         pet_insurance.plan_type atualizado pela planilha
--   - price_updated        patient_custom_prices.custom_price atualizado
--   - entry_created        financial_entry individual gerado pela remessa
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS patient_petlove_history (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID          NOT NULL REFERENCES clinics(id)              ON DELETE CASCADE,
  patient_id      UUID          NOT NULL REFERENCES patients(id)             ON DELETE CASCADE,
  remittance_id   UUID          REFERENCES petlove_remittances(id)           ON DELETE SET NULL,

  event_type      TEXT          NOT NULL
                                CHECK (event_type IN (
                                  'patient_created',
                                  'plan_updated',
                                  'price_updated',
                                  'entry_created'
                                )),
  description     TEXT          NOT NULL,
  metadata        JSONB         NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_petlove_history_clinic
  ON patient_petlove_history (clinic_id);

CREATE INDEX IF NOT EXISTS idx_patient_petlove_history_patient
  ON patient_petlove_history (clinic_id, patient_id, created_at DESC);

ALTER TABLE patient_petlove_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_patient_petlove_history" ON patient_petlove_history;
CREATE POLICY "clinic_isolation_patient_petlove_history"
  ON patient_petlove_history FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE patient_petlove_history IS
  'Eventos auditáveis vindos da conciliação Petlove (cadastros criados, planos/preços atualizados). Renderizado no perfil do pet.';

COMMIT;
