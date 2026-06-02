-- 0217 — Junção n:n entre stock_items (serviços) e insurance_providers (convênios).
-- Permite especificar quais convênios aceitam cada serviço, complementando
-- stock_items.default_insurance_price (que vale para todos).
-- Sprint 2026-06-02 — lapidação Item B do Convênio Petlove.

BEGIN;

CREATE TABLE IF NOT EXISTS stock_item_insurance_providers (
  stock_item_id          UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  insurance_provider_id  UUID NOT NULL REFERENCES insurance_providers(id) ON DELETE CASCADE,
  clinic_id              UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stock_item_id, insurance_provider_id)
);

CREATE INDEX IF NOT EXISTS idx_siip_clinic         ON stock_item_insurance_providers (clinic_id);
CREATE INDEX IF NOT EXISTS idx_siip_provider       ON stock_item_insurance_providers (insurance_provider_id);

-- RLS: isolamento por clínica
ALTER TABLE stock_item_insurance_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS siip_clinic_read   ON stock_item_insurance_providers;
DROP POLICY IF EXISTS siip_clinic_write  ON stock_item_insurance_providers;

CREATE POLICY siip_clinic_read ON stock_item_insurance_providers
  FOR SELECT TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY siip_clinic_write ON stock_item_insurance_providers
  FOR ALL TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM profiles WHERE id = auth.uid()
    )
  );

COMMIT;
