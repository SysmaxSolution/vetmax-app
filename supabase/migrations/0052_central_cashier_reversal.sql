-- =============================================================================
-- VetMax — Migration 0052: Central Cashier — Campos de Estorno
--
-- Adiciona campos de estorno em central_cashier com auditoria completa.
-- Estorno cria novo status 'reversed' + registra quem/quando/por quê.
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Adicionar campos de estorno em central_cashier
-- =========================================================================

ALTER TABLE central_cashier
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by     UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS payment_method  TEXT,
  ADD COLUMN IF NOT EXISTS patient_name    TEXT,
  ADD COLUMN IF NOT EXISTS tutor_name      TEXT;

-- Ampliar o CHECK de status para incluir 'reversed'
ALTER TABLE central_cashier
  DROP CONSTRAINT IF EXISTS central_cashier_status_check;

ALTER TABLE central_cashier
  ADD CONSTRAINT central_cashier_status_check
    CHECK (status IN ('recorded', 'verified', 'archived', 'reversed'));

-- Garantir integridade: reversed exige reversal_reason
ALTER TABLE central_cashier
  ADD CONSTRAINT central_cashier_reversal_integrity
    CHECK (
      status != 'reversed' OR
      (reversal_reason IS NOT NULL AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL)
    );

COMMENT ON COLUMN central_cashier.reversal_reason IS 'Justificativa obrigatória para estornos';
COMMENT ON COLUMN central_cashier.reversed_at IS 'Timestamp do estorno';
COMMENT ON COLUMN central_cashier.reversed_by IS 'Usuário que executou o estorno';
COMMENT ON COLUMN central_cashier.payment_method IS 'pix|credit|debit|cash|convenio|other';
COMMENT ON COLUMN central_cashier.patient_name IS 'Nome do pet — desnormalizado para display rápido';
COMMENT ON COLUMN central_cashier.tutor_name IS 'Nome do tutor — desnormalizado para display rápido';

-- =========================================================================
-- 2. Índice para busca por forma de pagamento (relatório de fechamento)
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_central_cashier_payment_method
  ON central_cashier (clinic_id, payment_method)
  WHERE payment_method IS NOT NULL;

-- =========================================================================
-- 3. RPC: rpc_reverse_cashier_entry
-- Atomicamente muda status para 'reversed' com auditoria.
-- Apenas roles: admin, owner, manager
-- =========================================================================

CREATE OR REPLACE FUNCTION rpc_reverse_cashier_entry(
  p_entry_id     UUID,
  p_reason       TEXT,
  p_reversed_by  UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  entry_id UUID,
  success  BOOLEAN,
  message  TEXT
) AS $$
DECLARE
  v_entry      RECORD;
  v_user_role  TEXT;
  v_clinic_id  UUID;
BEGIN
  -- Verificar role do usuário
  SELECT role, clinic_id INTO v_user_role, v_clinic_id
  FROM profiles WHERE id = p_reversed_by;

  IF v_user_role NOT IN ('admin', 'owner', 'manager') THEN
    RETURN QUERY SELECT p_entry_id, false, 'Permissão negada: apenas admin/owner/manager podem estornar';
    RETURN;
  END IF;

  -- Buscar e bloquear o lançamento
  SELECT * INTO v_entry FROM central_cashier
  WHERE id = p_entry_id AND clinic_id = v_clinic_id
  FOR UPDATE;

  IF v_entry IS NULL THEN
    RETURN QUERY SELECT p_entry_id, false, 'Lançamento não encontrado ou pertence a outra clínica';
    RETURN;
  END IF;

  IF v_entry.status = 'reversed' THEN
    RETURN QUERY SELECT p_entry_id, false, 'Lançamento já foi estornado anteriormente';
    RETURN;
  END IF;

  IF v_entry.status = 'archived' THEN
    RETURN QUERY SELECT p_entry_id, false, 'Lançamentos arquivados não podem ser estornados';
    RETURN;
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN QUERY SELECT p_entry_id, false, 'Justificativa de estorno é obrigatória';
    RETURN;
  END IF;

  -- Executar estorno
  UPDATE central_cashier
  SET
    status         = 'reversed',
    reversal_reason = p_reason,
    reversed_at    = now(),
    reversed_by    = p_reversed_by
  WHERE id = p_entry_id;

  RETURN QUERY SELECT p_entry_id, true, 'Estorno registrado com sucesso';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION rpc_reverse_cashier_entry IS
  'Estorna um lançamento do caixa central. Exige role admin/owner/manager e justificativa obrigatória.';

-- =========================================================================
-- 4. RPC: rpc_get_cashier_dashboard
-- Retorna agregados do dia para o dashboard do Caixa
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
  v_user_role TEXT;
  v_user_clinic UUID;
  v_inflows   NUMERIC := 0;
  v_outflows  NUMERIC := 0;
  v_pending   INTEGER := 0;
  v_session   RECORD;
  v_by_method JSONB := '{}'::jsonb;
BEGIN
  -- Validar clinic_id
  SELECT role, clinic_id INTO v_user_role, v_user_clinic
  FROM profiles WHERE id = auth.uid();

  IF v_user_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido para este usuário';
  END IF;

  -- Entradas do dia (excluindo estornos)
  SELECT COALESCE(SUM(amount), 0) INTO v_inflows
  FROM central_cashier
  WHERE clinic_id = p_clinic_id
    AND DATE(created_at) = p_date
    AND status != 'reversed';

  -- Pendentes (recorded, não verificados)
  SELECT COUNT(*) INTO v_pending
  FROM central_cashier
  WHERE clinic_id = p_clinic_id
    AND DATE(created_at) = p_date
    AND status = 'recorded';

  -- Saídas do dia
  SELECT COALESCE(SUM(amount), 0) INTO v_outflows
  FROM cashier_outflows
  WHERE clinic_id = p_clinic_id
    AND DATE(created_at) = p_date;

  -- Sessão aberta
  SELECT id, status, opening_balance INTO v_session
  FROM cashier_sessions
  WHERE clinic_id = p_clinic_id
    AND DATE(opened_at) = p_date
  ORDER BY opened_at DESC
  LIMIT 1;

  -- Breakdown por forma de pagamento
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
    v_session.id,
    v_session.status,
    v_session.opening_balance,
    COALESCE(v_by_method, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
