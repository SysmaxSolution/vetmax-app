-- =============================================================================
-- VetMax — Migration 0050: Cashier Sessions (Abertura/Fechamento de Caixa)
--
-- Controla o ciclo diário do caixa: abertura com saldo inicial,
-- fechamento com conferência. Garante no banco que apenas 1 sessão
-- pode estar aberta por clínica (UNIQUE parcial).
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Tabela cashier_sessions
-- =========================================================================

CREATE TABLE IF NOT EXISTS cashier_sessions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID          NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  opened_by        UUID          NOT NULL REFERENCES profiles(id),
  opened_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  closed_by        UUID          REFERENCES profiles(id),
  closed_at        TIMESTAMPTZ,
  opening_balance  NUMERIC(12,2) NOT NULL DEFAULT 0 CONSTRAINT opening_balance_positive CHECK (opening_balance >= 0),
  closing_balance  NUMERIC(12,2),
  status           TEXT          NOT NULL DEFAULT 'open',
  notes            TEXT,

  CONSTRAINT cashier_sessions_status_check
    CHECK (status IN ('open', 'closed')),

  CONSTRAINT cashier_sessions_close_requires_balance
    CHECK (status = 'open' OR (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL))
);

COMMENT ON TABLE cashier_sessions IS 'Controle de abertura e fechamento de caixa diário por clínica';
COMMENT ON COLUMN cashier_sessions.opening_balance IS 'Valor em espécie no início do expediente (fundo de troco)';
COMMENT ON COLUMN cashier_sessions.closing_balance IS 'Valor conferido no fechamento (calculado pelo sistema)';
COMMENT ON COLUMN cashier_sessions.status IS 'open | closed';

-- =========================================================================
-- 2. UNIQUE parcial: apenas 1 sessão aberta por clínica (anti race condition)
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uidx_cashier_sessions_one_open_per_clinic
  ON cashier_sessions (clinic_id)
  WHERE status = 'open';

-- Índice para listar histórico por clínica
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_clinic_date
  ON cashier_sessions (clinic_id, opened_at DESC);

-- =========================================================================
-- 3. FK em central_cashier → cashier_sessions
-- =========================================================================

ALTER TABLE central_cashier
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES cashier_sessions(id);

CREATE INDEX IF NOT EXISTS idx_central_cashier_session
  ON central_cashier (session_id)
  WHERE session_id IS NOT NULL;

-- =========================================================================
-- 4. RLS: cashier_sessions
-- =========================================================================

ALTER TABLE cashier_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashier_sessions_select_clinic"
  ON cashier_sessions FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner', 'manager', 'accountant', 'receptionist')
  );

CREATE POLICY "cashier_sessions_insert_managers"
  ON cashier_sessions FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner', 'manager')
  );

CREATE POLICY "cashier_sessions_update_managers"
  ON cashier_sessions FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner', 'manager')
  );

-- =========================================================================
-- 5. Trigger de auditoria para cashier_sessions
-- =========================================================================

CREATE OR REPLACE FUNCTION audit_cashier_sessions()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    clinic_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details,
    created_at
  ) VALUES (
    NEW.clinic_id,
    auth.uid(),
    TG_OP,
    'cashier_sessions',
    NEW.id,
    jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    ),
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_cashier_sessions
AFTER INSERT OR UPDATE ON cashier_sessions
FOR EACH ROW
EXECUTE FUNCTION audit_cashier_sessions();

COMMIT;
