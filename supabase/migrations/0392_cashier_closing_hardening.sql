-- 0392 — Endurecimento do fechamento de caixa (P1 do llm-council)
--
-- Complementa a 0391 (trigger de auto-vínculo). Aqui:
--  1. RPC atômico que vincula órfãos à sessão com advisory lock, eliminando
--     a corrida entre fechamento e inserts concorrentes e removendo a
--     necessidade do fallback ".or" defensivo no app (que mascarava falhas).
--  2. View de monitoramento de "órfãos vivos" (lançamentos sem session_id
--     durante uma sessão aberta) — alvo de alerta; deve ficar sempre vazia.
--
-- NOTA: NÃO aplicamos NOT NULL em central_cashier.session_id de propósito —
-- vendas com caixa fechado são um estado legítimo (vinculadas na próxima
-- abertura). Tornar NOT NULL exigiria decisão de produto (proibir venda sem
-- caixa aberto) e quebraria o fluxo atual. A FK já existe desde a 0050.

-- ─── 1. Vínculo atômico de órfãos à sessão ──────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_link_session_orphans(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic  uuid;
  v_opened  timestamptz;
  v_count   integer;
BEGIN
  SELECT clinic_id, opened_at INTO v_clinic, v_opened
    FROM cashier_sessions WHERE id = p_session_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Sessão % não encontrada', p_session_id;
  END IF;

  -- Multi-tenancy: chamadas autenticadas só podem mexer na própria clínica.
  -- (auth.uid() é nulo em contexto admin/serviço, que confiamos.)
  IF auth.uid() IS NOT NULL
     AND v_clinic <> (SELECT clinic_id FROM profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado à sessão de outra clínica';
  END IF;

  -- Serializa fechamentos/links concorrentes da MESMA sessão.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  UPDATE central_cashier cc
     SET session_id = p_session_id
   WHERE cc.clinic_id   = v_clinic
     AND cc.session_id IS NULL
     AND cc.created_at  >= v_opened
     AND cc.status <> 'reversed';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION rpc_link_session_orphans(uuid) IS
  'Vincula lançamentos órfãos (session_id NULL, criados após a abertura) à sessão, com advisory lock. Chamado antes de calcular/fechar o caixa.';

-- ─── 2. Monitoramento: órfãos vivos durante sessão aberta ───────────────────
-- security_invoker garante que a RLS de quem consulta seja respeitada.
CREATE OR REPLACE VIEW v_cashier_orphan_entries
WITH (security_invoker = true) AS
SELECT cc.id,
       cc.clinic_id,
       cc.amount,
       cc.payment_method,
       cc.status,
       cc.source_module,
       cc.created_at,
       s.id        AS open_session_id,
       s.opened_at AS session_opened_at
  FROM central_cashier cc
  JOIN cashier_sessions s
    ON s.clinic_id = cc.clinic_id
   AND s.status    = 'open'
 WHERE cc.session_id IS NULL
   AND cc.status NOT IN ('reversed', 'archived')
   AND cc.created_at >= s.opened_at;

COMMENT ON VIEW v_cashier_orphan_entries IS
  'Lançamentos sem session_id durante uma sessão aberta. Deve ficar SEMPRE vazia (trigger 0391 + RPC 0392). Linhas aqui = alerta de inconsistência.';
