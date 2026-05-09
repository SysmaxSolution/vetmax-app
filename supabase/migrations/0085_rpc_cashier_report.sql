-- =============================================================================
-- VetMax — Migration 0085: RPC rpc_cashier_report
--
-- Busca multi-filtro para a aba Relatórios do módulo Caixa.
-- Une central_cashier + cashier_outflows num formato comum (com supplier_name).
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS rpc_cashier_report(UUID, DATE, DATE, JSONB);

CREATE OR REPLACE FUNCTION rpc_cashier_report(
  p_clinic_id    UUID,
  p_from         DATE,
  p_to           DATE,
  p_filters      JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  entry_id          UUID,
  entry_type        TEXT,           -- 'inflow' | 'outflow'
  occurred_at       TIMESTAMPTZ,
  amount            NUMERIC,
  source_module     TEXT,           -- grooming | pharmacy | consultation | exam | manual | adjustment | outflow:<category>
  payment_method    TEXT,
  status            TEXT,
  patient_name      TEXT,
  tutor_name        TEXT,
  supplier_id       UUID,
  supplier_name     TEXT,
  description       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role     TEXT;
  v_user_clinic   UUID;
  v_source_mod    TEXT := p_filters->>'source_module';
  v_pay_method    TEXT := p_filters->>'payment_method';
  v_status        TEXT := p_filters->>'status';
  v_supplier_id   UUID := NULLIF(p_filters->>'supplier_id', '')::UUID;
  v_q             TEXT := p_filters->>'q';
  v_limit         INTEGER := COALESCE((p_filters->>'limit')::INTEGER, 500);
BEGIN
  -- Autorização
  SELECT role, clinic_id INTO v_user_role, v_user_clinic
  FROM profiles WHERE id = auth.uid();

  IF v_user_clinic IS NULL OR v_user_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido para este usuário';
  END IF;

  IF v_user_role NOT IN ('admin','owner','manager','accountant') THEN
    RAISE EXCEPTION 'Acesso negado aos relatórios do caixa';
  END IF;

  -- Limite de segurança
  IF v_limit > 5000 THEN v_limit := 5000; END IF;

  RETURN QUERY
  WITH inflows AS (
    SELECT
      cc.id                          AS entry_id,
      'inflow'::TEXT                 AS entry_type,
      cc.created_at                  AS occurred_at,
      cc.amount                      AS amount,
      cc.source_module               AS source_module,
      cc.payment_method              AS payment_method,
      cc.status                      AS status,
      cc.patient_name                AS patient_name,
      cc.tutor_name                  AS tutor_name,
      NULL::UUID                     AS supplier_id,
      NULL::TEXT                     AS supplier_name,
      cc.reason                      AS description
    FROM central_cashier cc
    WHERE cc.clinic_id = p_clinic_id
      AND cc.created_at >= p_from::TIMESTAMPTZ
      AND cc.created_at <  (p_to + INTERVAL '1 day')::TIMESTAMPTZ
      AND (v_source_mod IS NULL OR cc.source_module = v_source_mod)
      AND (v_pay_method IS NULL OR cc.payment_method = v_pay_method)
      AND (v_status     IS NULL OR cc.status = v_status)
      AND (v_q IS NULL OR (
            cc.patient_name ILIKE '%' || v_q || '%' OR
            cc.tutor_name   ILIKE '%' || v_q || '%' OR
            cc.reason       ILIKE '%' || v_q || '%'
          ))
  ),
  outflows AS (
    SELECT
      o.id                                       AS entry_id,
      'outflow'::TEXT                            AS entry_type,
      o.created_at                               AS occurred_at,
      o.amount                                   AS amount,
      ('outflow:' || o.category)::TEXT           AS source_module,
      NULL::TEXT                                 AS payment_method,
      'recorded'::TEXT                           AS status,
      NULL::TEXT                                 AS patient_name,
      NULL::TEXT                                 AS tutor_name,
      o.supplier_id                              AS supplier_id,
      s.name                                     AS supplier_name,
      o.description                              AS description
    FROM cashier_outflows o
    LEFT JOIN suppliers s ON s.id = o.supplier_id
    WHERE o.clinic_id = p_clinic_id
      AND o.created_at >= p_from::TIMESTAMPTZ
      AND o.created_at <  (p_to + INTERVAL '1 day')::TIMESTAMPTZ
      AND (v_source_mod IS NULL OR v_source_mod = 'outflow' OR ('outflow:' || o.category) = v_source_mod)
      AND (v_supplier_id IS NULL OR o.supplier_id = v_supplier_id)
      AND (v_q IS NULL OR (
            o.description ILIKE '%' || v_q || '%' OR
            s.name        ILIKE '%' || v_q || '%'
          ))
  )
  SELECT * FROM inflows
  WHERE v_supplier_id IS NULL  -- supplier filter only applies to outflows
  UNION ALL
  SELECT * FROM outflows
  ORDER BY occurred_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_cashier_report(UUID, DATE, DATE, JSONB) TO authenticated;

COMMENT ON FUNCTION rpc_cashier_report(UUID, DATE, DATE, JSONB) IS
  'Relatório consolidado do Caixa com filtros: source_module, payment_method, status, supplier_id, q, limit';

COMMIT;
