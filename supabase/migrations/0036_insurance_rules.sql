-- =============================================================================
-- VetMax — Migration 0036: insurance_rules
-- Knowledge base de regras anti-glosa por procedimento e convênio
-- =============================================================================

CREATE TABLE IF NOT EXISTS insurance_rules (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              uuid        NOT NULL REFERENCES clinics(id)             ON DELETE CASCADE,
  provider_id            uuid        NOT NULL REFERENCES insurance_providers(id) ON DELETE CASCADE,
  procedure_name         text        NOT NULL,
  rule_type              text        NOT NULL
                         CHECK (rule_type IN (
                           'requires_justification',
                           'requires_prior_auth',
                           'limited_frequency',
                           'not_covered',
                           'informational'
                         )),
  rule_description       text        NOT NULL,
  justification_template text,
  severity               text        NOT NULL DEFAULT 'warning'
                         CHECK (severity IN ('blocking','warning','info')),
  is_active              boolean     NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_rules_clinic_id   ON insurance_rules(clinic_id);
CREATE INDEX IF NOT EXISTS idx_insurance_rules_provider_id ON insurance_rules(provider_id);

ALTER TABLE insurance_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_insurance_rules" ON insurance_rules;
CREATE POLICY "clinic_isolation_insurance_rules"
  ON insurance_rules FOR ALL TO authenticated
  USING  (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
