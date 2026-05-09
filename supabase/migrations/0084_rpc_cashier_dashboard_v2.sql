-- =============================================================================
-- VetMax — Migration 0084: RPC rpc_get_cashier_dashboard v2
--
-- Adiciona pending_amount (R$ a baixar) somando invoices.pending +
-- grooming_sessions.pending. Mantém demais campos.
--
-- DEFINIÇÃO DE "BAIXADO":
--   - Recebimentos baixados = central_cashier (todos lançamentos já são pagos)
--   - Saídas baixadas       = cashier_outflows (todas já são pagas)
--   - Pendentes (R$)        = invoices.pending + grooming_sessions.pending
--                             (saldo acumulado em aberto, não filtrado por data)
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS rpc_get_cashier_dashboard(UUID, DATE);

CREATE OR REPLACE FUNCTION rpc_get_cashier_dashboard(
  p_clinic_id  UUID,
  p_date       DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_inflows       NUMERIC,
  total_outflows      NUMERIC,
  net_balance         NUMERIC,
  pending_amount      NUMERIC,
  pending_count       INTEGER,
  session_id          UUID,
  session_status      TEXT,
  opening_balance     NUMERIC,
  by_payment_method   JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role               TEXT;
  v_user_clinic             UUID;
  v_inflows                 NUMERIC := 0;
  v_outflows                NUMERIC := 0;
  v_pending_invoices        NUMERIC := 0;
  v_pending_grooming        NUMERIC := 0;
  v_pending_count_inv       INTEGER := 0;
  v_pending_count_groom     INTEGER := 0;
  v_sess_id                 UUID;
  v_sess_status             TEXT;
  v_sess_opening_balance    NUMERIC := 0;
  v_by_method               JSONB := '{}'::jsonb;
BEGIN
  -- Autorização
  SELECT role, clinic_id INTO v_user_role, v_user_clinic
  FROM profiles WHERE id = auth.uid();

  IF v_user_clinic IS NULL OR v_user_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido para este usuário';
  END IF;

  IF v_user_role NOT IN ('admin','owner','manager','accountant','receptionist') THEN
    RAISE EXCEPTION 'Acesso negado ao dashboard do caixa';
  END IF;

  -- ───────────────────────────────────────────────────────────────────────
  -- Recebimentos baixados (do dia)
  -- ───────────────────────────────────────────────────────────────────────
  SELECT COALESCE(SUM(amount), 0) INTO v_inflows
  FROM central_cashier
  WHERE clinic_id = p_clinic_id
    AND DATE(created_at) = p_date
    AND status != 'reversed'
    AND amount > 0;

  -- ───────────────────────────────────────────────────────────────────────
  -- Saídas baixadas (do dia)
  -- ───────────────────────────────────────────────────────────────────────
  SELECT COALESCE(SUM(amount), 0) INTO v_outflows
  FROM cashier_outflows
  WHERE clinic_id = p_clinic_id
    AND DATE(created_at) = p_date;

  -- ───────────────────────────────────────────────────────────────────────
  -- Pendentes — saldo acumulado em aberto (NÃO filtrado por data)
  -- Soma invoices pendentes + grooming_sessions pendentes
  -- ───────────────────────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(total_amount), 0),
    COUNT(*)
  INTO v_pending_invoices, v_pending_count_inv
  FROM invoices
  WHERE clinic_id = p_clinic_id
    AND status = 'pending';

  SELECT
    COALESCE(SUM(price_total), 0),
    COUNT(*)
  INTO v_pending_grooming, v_pending_count_groom
  FROM grooming_sessions
  WHERE clinic_id = p_clinic_id
    AND payment_status = 'pending'
    AND price_total IS NOT NULL;

  -- ───────────────────────────────────────────────────────────────────────
  -- Sessão aberta (se houver)
  -- ───────────────────────────────────────────────────────────────────────
  SELECT id, status, COALESCE(opening_balance, 0)
    INTO v_sess_id, v_sess_status, v_sess_opening_balance
  FROM cashier_sessions
  WHERE clinic_id = p_clinic_id
    AND status = 'open'
  LIMIT 1;

  -- ───────────────────────────────────────────────────────────────────────
  -- Breakdown por forma de pagamento (apenas dos baixados do dia)
  -- ───────────────────────────────────────────────────────────────────────
  SELECT COALESCE(jsonb_object_agg(
           method,
           jsonb_build_object('amount', amt, 'count', cnt)
         ), '{}'::jsonb)
    INTO v_by_method
  FROM (
    SELECT
      COALESCE(payment_method, 'nao_informado') AS method,
      SUM(amount) AS amt,
      COUNT(*)   AS cnt
    FROM central_cashier
    WHERE clinic_id = p_clinic_id
      AND DATE(created_at) = p_date
      AND status != 'reversed'
      AND amount > 0
    GROUP BY 1
  ) t;

  -- ───────────────────────────────────────────────────────────────────────
  -- Retorno
  -- ───────────────────────────────────────────────────────────────────────
  RETURN QUERY SELECT
    v_inflows,
    v_outflows,
    (v_inflows - v_outflows + COALESCE(v_sess_opening_balance, 0))::NUMERIC,
    (v_pending_invoices + v_pending_grooming)::NUMERIC,
    (v_pending_count_inv + v_pending_count_groom)::INTEGER,
    v_sess_id,
    v_sess_status,
    v_sess_opening_balance,
    v_by_method;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_cashier_dashboard(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION rpc_get_cashier_dashboard(UUID, DATE) IS
  'Dashboard do Caixa: Recebimentos/Saídas baixados do dia + Pendentes acumulados (R$)';

COMMIT;
