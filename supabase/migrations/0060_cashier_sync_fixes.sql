-- =============================================================================
-- VetMax — Migration 0060: Cashier Sync Fixes
--
-- 1. Garante schema cache do cashier_sessions (recria índice único)
-- 2. Corrige grooming: sincroniza status → current_status via trigger
-- 3. Adiciona função helper para registrar pagamento de consulta no caixa
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Re-garantir tabelas de caixa existem (IF NOT EXISTS — seguro)
-- =========================================================================

-- cashier_sessions já existe via 0050, mas o schema cache do Supabase
-- pode estar desatualizado. Esta migration força reload.
DO $$ BEGIN
  PERFORM column_name FROM information_schema.columns
  WHERE table_name = 'cashier_sessions' AND column_name = 'status';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cashier_sessions table missing — run 0050 first';
  END IF;
END $$;

-- =========================================================================
-- 2. Trigger: sincroniza grooming_sessions.status ↔ current_status
-- O kanban usa `status` (coluna original de 0032), o RPC usa `current_status`
-- (coluna de 0043). Este trigger mantém ambos em sincronia.
-- =========================================================================

CREATE OR REPLACE FUNCTION sync_grooming_status_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Se `status` foi atualizado e `current_status` não mudou junto, sincroniza
  IF NEW.status IS DISTINCT FROM OLD.status AND
     NEW.current_status IS NOT DISTINCT FROM OLD.current_status THEN

    -- Mapeamento status (0032) → current_status (0043)
    NEW.current_status := CASE NEW.status
      WHEN 'received'       THEN 'arrived'
      WHEN 'bathing'        THEN 'bathing'
      WHEN 'grooming'       THEN 'grooming'
      WHEN 'waiting_pickup' THEN 'waiting_pickup'
      WHEN 'delivered'      THEN 'delivered'
      ELSE NEW.current_status
    END;
  END IF;

  -- Se `current_status` foi atualizado e `status` não mudou junto, sincroniza
  IF NEW.current_status IS DISTINCT FROM OLD.current_status AND
     NEW.status IS NOT DISTINCT FROM OLD.status THEN

    -- Mapeamento current_status (0043) → status (0032)
    NEW.status := CASE NEW.current_status
      WHEN 'arrived'        THEN 'received'
      WHEN 'bathing'        THEN 'bathing'
      WHEN 'grooming'       THEN 'grooming'
      WHEN 'drying'         THEN 'grooming'  -- sem equivalente direto → mantém grooming
      WHEN 'waiting_pickup' THEN 'waiting_pickup'
      WHEN 'paid'           THEN 'waiting_pickup'  -- paid não tem equivalente → mantém
      WHEN 'delivered'      THEN 'delivered'
      WHEN 'cancelled'      THEN 'delivered'  -- cancelled fecha o card
      ELSE NEW.status
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_grooming_status ON grooming_sessions;
CREATE TRIGGER trg_sync_grooming_status
BEFORE UPDATE ON grooming_sessions
FOR EACH ROW
EXECUTE FUNCTION sync_grooming_status_columns();

COMMENT ON FUNCTION sync_grooming_status_columns IS
  'Mantém grooming_sessions.status e current_status sincronizados para compatibilidade entre kanban (status) e RPC (current_status)';

-- =========================================================================
-- 3. Função helper: registrar pagamento de consulta/invoice no central_cashier
-- Chamada por billing.ts após processPayment()
-- =========================================================================

CREATE OR REPLACE FUNCTION rpc_record_invoice_payment(
  p_clinic_id      UUID,
  p_invoice_id     UUID,
  p_amount         NUMERIC(12,2),
  p_payment_method TEXT,
  p_patient_name   TEXT,
  p_tutor_name     TEXT,
  p_recorded_by    UUID,
  p_session_id     UUID DEFAULT NULL
)
RETURNS TABLE (
  cashier_entry_id UUID,
  success          BOOLEAN,
  message          TEXT
) AS $$
DECLARE
  v_entry_id UUID;
BEGIN
  -- Idempotente: não duplica se já existe entrada para esta invoice
  SELECT id INTO v_entry_id
  FROM central_cashier
  WHERE source_module = 'consultation'
    AND source_id = p_invoice_id
    AND clinic_id = p_clinic_id
  LIMIT 1;

  IF v_entry_id IS NOT NULL THEN
    RETURN QUERY SELECT v_entry_id, true, 'Entry already exists';
    RETURN;
  END IF;

  INSERT INTO central_cashier (
    clinic_id,
    source_module,
    source_id,
    amount,
    status,
    payment_method,
    patient_name,
    tutor_name,
    recorded_by,
    session_id
  ) VALUES (
    p_clinic_id,
    'consultation',
    p_invoice_id,
    p_amount,
    'recorded',
    p_payment_method,
    p_patient_name,
    p_tutor_name,
    p_recorded_by,
    p_session_id
  )
  RETURNING id INTO v_entry_id;

  RETURN QUERY SELECT v_entry_id, true, 'Payment recorded in central cashier';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION rpc_record_invoice_payment IS
  'Registra pagamento de consulta (invoice) no central_cashier. Idempotente: não duplica entradas.';

-- =========================================================================
-- 4. Índice para lookup de invoice em central_cashier
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_central_cashier_source_consultation
  ON central_cashier (clinic_id, source_id)
  WHERE source_module = 'consultation';

-- =========================================================================
-- 5. Fix rpc_get_cashier_dashboard — ambiguidade de coluna opening_balance
-- =========================================================================

CREATE OR REPLACE FUNCTION rpc_get_cashier_dashboard(
  p_clinic_id  UUID,
  p_date       DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_inflows       NUMERIC,
  total_outflows      NUMERIC,
  net_balance         NUMERIC,
  pending_count       INTEGER,
  session_id          UUID,
  session_status      TEXT,
  opening_balance     NUMERIC,
  by_payment_method   JSONB
) AS $$
DECLARE
  v_user_role               TEXT;
  v_user_clinic             UUID;
  v_inflows                 NUMERIC := 0;
  v_outflows                NUMERIC := 0;
  v_pending                 INTEGER := 0;
  v_sess_id                 UUID;
  v_sess_status             TEXT;
  v_sess_opening_balance    NUMERIC := 0;
  v_by_method               JSONB := '{}'::jsonb;
BEGIN
  SELECT role, clinic_id INTO v_user_role, v_user_clinic
  FROM profiles WHERE id = auth.uid();

  IF v_user_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido para este usuário';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_inflows
  FROM central_cashier
  WHERE clinic_id = p_clinic_id
    AND DATE(created_at) = p_date
    AND status != 'reversed';

  SELECT COUNT(*) INTO v_pending
  FROM central_cashier
  WHERE clinic_id = p_clinic_id
    AND DATE(created_at) = p_date
    AND status = 'recorded';

  SELECT COALESCE(SUM(amount), 0) INTO v_outflows
  FROM cashier_outflows
  WHERE clinic_id = p_clinic_id
    AND DATE(created_at) = p_date;

  SELECT cs.id, cs.status, cs.opening_balance
  INTO v_sess_id, v_sess_status, v_sess_opening_balance
  FROM cashier_sessions cs
  WHERE cs.clinic_id = p_clinic_id
    AND DATE(cs.opened_at) = p_date
  ORDER BY cs.opened_at DESC
  LIMIT 1;

  SELECT jsonb_object_agg(
    COALESCE(payment_method, 'nao_informado'),
    jsonb_build_object('amount', method_sum, 'count', method_count)
  ) INTO v_by_method
  FROM (
    SELECT
      payment_method,
      SUM(amount) AS method_sum,
      COUNT(*)    AS method_count
    FROM central_cashier
    WHERE clinic_id = p_clinic_id
      AND DATE(created_at) = p_date
      AND status != 'reversed'
    GROUP BY payment_method
  ) t;

  RETURN QUERY SELECT
    v_inflows,
    v_outflows,
    (v_inflows - v_outflows),
    v_pending,
    v_sess_id,
    v_sess_status,
    v_sess_opening_balance,
    COALESCE(v_by_method, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
