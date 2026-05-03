-- =============================================================================
-- VetMax — Migration 0034: insurance_providers
-- Convênios cadastrados por clínica (multi-tenant)
-- =============================================================================

CREATE TABLE IF NOT EXISTS insurance_providers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  plan_types   jsonb       NOT NULL DEFAULT '[]',
  portal_url   text,
  contact_info jsonb       NOT NULL DEFAULT '{}',
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_providers_clinic_id ON insurance_providers(clinic_id);

ALTER TABLE insurance_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_insurance_providers" ON insurance_providers;
CREATE POLICY "clinic_isolation_insurance_providers"
  ON insurance_providers FOR ALL TO authenticated
  USING  (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
