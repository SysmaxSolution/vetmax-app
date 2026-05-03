-- =============================================================================
-- VetMax — Migration 0078: Logs Autônomos de Erros
-- Captura exceções/erros em produção com caminho do usuário.
-- Alimenta fila de correções autônomas para o Claude.
-- LGPD: user_journey armazena apenas IDs e paths, sem dados pessoais.
-- =============================================================================

CREATE TABLE IF NOT EXISTS error_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  path           text        NOT NULL,
  error_message  text        NOT NULL,
  stack_trace    text,
  user_journey   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  severity       text        NOT NULL DEFAULT 'error',
  resolved       boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_clinic ON error_logs(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON error_logs(clinic_id) WHERE resolved = false;

-- RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_error_logs" ON error_logs;
CREATE POLICY "clinic_isolation_error_logs"
  ON error_logs FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

COMMENT ON TABLE error_logs IS 'Registro autônomo de erros para fila de correções. LGPD: sem dados pessoais em user_journey.';

-- ROLLBACK:
-- DROP TABLE IF EXISTS error_logs;
