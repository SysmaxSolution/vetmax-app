-- =============================================================================
-- VetMax — Migration 0176: Sprint Petlove Inteligente
--
-- Camada de inteligência sobre convênios veterinários (foco: Petlove).
-- Permite ao sistema responder antes do atendimento:
--   "Esse procedimento está coberto?"
--   "A carência foi cumprida?"
--   "Quanto o tutor vai pagar de coparticipação? Quem cobra?"
--
-- Tudo aditivo. Sem quebrar a operação atual.
-- =============================================================================

BEGIN;

-- ─── 1) pet_insurance.enrollment_date ──────────────────────────────────────
-- Quando o tutor aderiu ao plano. Quando NULL, fallback para created_at.
ALTER TABLE pet_insurance
  ADD COLUMN IF NOT EXISTS enrollment_date DATE;

COMMENT ON COLUMN pet_insurance.enrollment_date IS
  'Data de adesão do tutor ao plano (não confundir com data em que a clínica cadastrou o convênio). Usado para cálculo de carência.';

-- ─── 2) Tabela insurance_plan_coverage ─────────────────────────────────────
-- Catálogo "o que cada plano cobre". Alimentado por seed + auto-aprendizado
-- (a cada remessa fechada, refina copay_amount com a média observada).
CREATE TABLE IF NOT EXISTS insurance_plan_coverage (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id              UUID          NOT NULL REFERENCES insurance_providers(id) ON DELETE CASCADE,
  plan_type                TEXT          NOT NULL,
  procedure_pattern        TEXT          NOT NULL,                            -- nome (ou regex) do procedimento na nomenclatura do convênio
  coverage_category        TEXT          NOT NULL CHECK (coverage_category IN (
                                          'consulta',
                                          'vacina',
                                          'exame_simples',
                                          'exame_imagem',
                                          'cirurgia',
                                          'anestesia',
                                          'internacao',
                                          'castracao',
                                          'especialista',
                                          'procedimento_clinico',
                                          'outros'
                                        )),
  is_covered               BOOLEAN       NOT NULL DEFAULT true,
  copay_amount             NUMERIC(8,2),                                       -- valor de coparticipação (NULL = variável/não definido)
  copay_charger            TEXT          NOT NULL DEFAULT 'clinic'
                                          CHECK (copay_charger IN ('clinic', 'provider', 'mixed')),
  waiting_days             INTEGER       NOT NULL DEFAULT 0,                  -- carência em dias
  notes                    TEXT,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (provider_id, plan_type, procedure_pattern)
);

CREATE INDEX IF NOT EXISTS idx_insurance_plan_coverage_lookup
  ON insurance_plan_coverage (provider_id, plan_type);

ALTER TABLE insurance_plan_coverage ENABLE ROW LEVEL SECURITY;

-- Catálogo público entre clínicas — qualquer authenticated lê
DROP POLICY IF EXISTS "insurance_plan_coverage_read_all" ON insurance_plan_coverage;
CREATE POLICY "insurance_plan_coverage_read_all"
  ON insurance_plan_coverage FOR SELECT TO authenticated
  USING (true);

-- Apenas service_role escreve (admin/seed)
DROP POLICY IF EXISTS "insurance_plan_coverage_write_admin" ON insurance_plan_coverage;
CREATE POLICY "insurance_plan_coverage_write_admin"
  ON insurance_plan_coverage FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE insurance_plan_coverage IS
  'Catálogo de cobertura por convênio + plano + procedimento. Permite pré-checagem antes do atendimento (coberto, copay, carência).';
COMMENT ON COLUMN insurance_plan_coverage.copay_charger IS
  'clinic = cobrado pela clínica no caixa; provider = cobrado pela Petlove no cartão; mixed = parte cada.';

COMMIT;
