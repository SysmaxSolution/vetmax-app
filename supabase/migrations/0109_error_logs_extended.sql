-- =============================================================================
-- VetMax — Migration 0109: G-07-A — Error Logs Extended + Fix Plans
-- Estende error_logs com campos de prioridade, dedup e rastreabilidade.
-- Cria fix_plans (global, sem clinic_id) para o ciclo de correção autônoma.
-- =============================================================================

-- ─── Parte 1: Extensão da tabela error_logs ───────────────────────────────────

-- Permite NULL em clinic_id para erros de servidor sem contexto de clínica
ALTER TABLE error_logs ALTER COLUMN clinic_id DROP NOT NULL;

ALTER TABLE error_logs
  ADD COLUMN IF NOT EXISTS priority         text        CHECK (priority IN ('P0','P1','P2')) DEFAULT 'P1',
  ADD COLUMN IF NOT EXISTS module           text,
  ADD COLUMN IF NOT EXISTS fingerprint      text,
  ADD COLUMN IF NOT EXISTS occurrence_count int         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source           text        NOT NULL DEFAULT 'client'
                                            CHECK (source IN ('client','server','api','edge','vercel'));

CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint
  ON error_logs(fingerprint, clinic_id) WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_priority
  ON error_logs(priority, resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_source
  ON error_logs(source, created_at DESC);

-- ─── Parte 2: Tabela fix_plans (global — sem clinic_id) ──────────────────────

CREATE TABLE IF NOT EXISTS fix_plans (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text        NOT NULL,
  priority              text        NOT NULL CHECK (priority IN ('P0','P1','P2')),
  status                text        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN (
                                      'draft','pending_approval','approved',
                                      'in_progress','pr_opened','completed',
                                      'fix_failed','rejected'
                                    )),
  affected_modules      text[]      NOT NULL DEFAULT '{}',
  affected_fingerprints text[]      NOT NULL DEFAULT '{}',
  error_summary         text,
  description_md        text,
  claude_analysis       jsonb,
  branch_name           text,
  pr_url                text,
  test_results          jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  approved_at           timestamptz,
  approved_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_fix_plans_status
  ON fix_plans(status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fix_plans_approved
  ON fix_plans(status) WHERE status = 'approved';

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_fix_plans_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fix_plans_updated_at ON fix_plans;
CREATE TRIGGER trg_fix_plans_updated_at
  BEFORE UPDATE ON fix_plans
  FOR EACH ROW EXECUTE FUNCTION update_fix_plans_updated_at();

-- RLS: apenas admin e manager podem ver/escrever planos de correção
ALTER TABLE fix_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_only_fix_plans_read"  ON fix_plans;
DROP POLICY IF EXISTS "admin_only_fix_plans_write" ON fix_plans;

CREATE POLICY "admin_only_fix_plans_read"
  ON fix_plans FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin','manager','vet')
  ));

CREATE POLICY "admin_only_fix_plans_write"
  ON fix_plans FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin','manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin','manager')
  ));

-- ─── Parte 3: FK de error_logs → fix_plans ───────────────────────────────────

ALTER TABLE error_logs
  ADD COLUMN IF NOT EXISTS fix_plan_id uuid REFERENCES fix_plans(id) ON DELETE SET NULL;

COMMENT ON TABLE fix_plans IS 'Planos de correção autônoma de bugs. Gerados por IA, aprovados por humanos, executados por Mozart Routine. Global — sem isolamento por clínica.';
COMMENT ON COLUMN error_logs.fingerprint       IS 'Hash(path+message) para deduplicação. Mesmos erros incrementam occurrence_count.';
COMMENT ON COLUMN error_logs.occurrence_count  IS 'Número de vezes que este erro ocorreu (atualizado por upsert no error-logger).';
COMMENT ON COLUMN error_logs.source            IS 'Origem do erro: client | server | api | edge | vercel.';
COMMENT ON COLUMN error_logs.priority          IS 'Prioridade classificada por IA: P0=crítico, P1=alto, P2=médio.';

-- ROLLBACK:
-- ALTER TABLE error_logs DROP COLUMN IF EXISTS fix_plan_id;
-- DROP TABLE IF EXISTS fix_plans;
-- ALTER TABLE error_logs DROP COLUMN IF EXISTS source;
-- ALTER TABLE error_logs DROP COLUMN IF EXISTS occurrence_count;
-- ALTER TABLE error_logs DROP COLUMN IF EXISTS fingerprint;
-- ALTER TABLE error_logs DROP COLUMN IF EXISTS module;
-- ALTER TABLE error_logs DROP COLUMN IF EXISTS priority;
-- ALTER TABLE error_logs ALTER COLUMN clinic_id SET NOT NULL;
