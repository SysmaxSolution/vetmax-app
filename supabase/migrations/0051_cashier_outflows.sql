-- =============================================================================
-- VetMax — Migration 0051: Cashier Outflows (Saídas de Caixa / Despesas)
--
-- Registra saídas de caixa: sangrias, despesas avulsas, retiradas.
-- Necessário para cálculo real do saldo (entradas - saídas).
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Tabela cashier_outflows
-- =========================================================================

CREATE TABLE IF NOT EXISTS cashier_outflows (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID          NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  session_id  UUID          REFERENCES cashier_sessions(id),
  amount      NUMERIC(12,2) NOT NULL CONSTRAINT outflow_positive CHECK (amount > 0),
  category    TEXT          NOT NULL DEFAULT 'other',
  description TEXT          NOT NULL,
  created_by  UUID          NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT cashier_outflows_category_check
    CHECK (category IN ('sangria', 'despesa_operacional', 'fornecedor', 'estorno', 'other'))
);

COMMENT ON TABLE cashier_outflows IS 'Saídas de caixa: sangrias, despesas, retiradas';
COMMENT ON COLUMN cashier_outflows.category IS 'sangria|despesa_operacional|fornecedor|estorno|other';
COMMENT ON COLUMN cashier_outflows.description IS 'Descrição obrigatória da saída';

CREATE INDEX IF NOT EXISTS idx_cashier_outflows_clinic_date
  ON cashier_outflows (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cashier_outflows_session
  ON cashier_outflows (session_id)
  WHERE session_id IS NOT NULL;

-- =========================================================================
-- 2. RLS: cashier_outflows
-- =========================================================================

ALTER TABLE cashier_outflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashier_outflows_select_clinic"
  ON cashier_outflows FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner', 'manager', 'accountant', 'receptionist')
  );

CREATE POLICY "cashier_outflows_insert_managers"
  ON cashier_outflows FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner', 'manager')
  );

-- Saídas não podem ser editadas — apenas estornadas via nova entrada
-- (imutabilidade do ledger financeiro)

-- =========================================================================
-- 3. Trigger de auditoria
-- =========================================================================

CREATE OR REPLACE FUNCTION audit_cashier_outflows()
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
    'cashier_outflows',
    NEW.id,
    jsonb_build_object('new', to_jsonb(NEW)),
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_cashier_outflows
AFTER INSERT ON cashier_outflows
FOR EACH ROW
EXECUTE FUNCTION audit_cashier_outflows();

COMMIT;
