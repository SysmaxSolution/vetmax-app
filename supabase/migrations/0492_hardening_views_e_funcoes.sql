-- 0492 — Fecha a superfície exposta pela chave anônima: views e funções.
--
-- Contexto: auditoria de 06/10/2026, disparada pelo alerta do Supabase.
-- A chave anônima é PÚBLICA (vai no bundle do navegador). Tudo que `anon`
-- puder ler ou executar está, na prática, aberto na internet.
--
-- ACHADO 1 — views SECURITY DEFINER legíveis por anon (CONFIRMADO explorável).
-- Seis views de compliance eram SECURITY DEFINER (ignoram RLS) E tinham SELECT
-- para `anon`. Teste em produção com a chave pública ANTES da correção:
--   chat_data_subject_report → 3 linhas (clinic_id, chat_title, body…)
--   retention_audit          → 4 linhas (clinic_id, tutor_id, tutor_name…)
-- Ou seja: corpo de mensagens internas e NOME DE TUTOR legíveis por qualquer um.
-- Correção: `security_invoker = on` (passa a respeitar a RLS de quem chama) +
-- revogar anon em todas e authenticated nas cinco que o código nem usa.
-- A única em uso (data_subject_access_report, via compliance.ts com checagem de
-- papel) mantém SELECT para authenticated.
--
-- ACHADO 2 — 51 funções SECURITY DEFINER executáveis por anon via /rest/v1/rpc.
-- Entre elas rpc_merge_tutor, anonimize_chat_for_subject, rpc_cancel_sale,
-- rpc_record_manual_inflow, next_document_number. Rodando como definer, agiam
-- sobre o clinic_id passado por parâmetro. 16 tinham guarda interna; 35 não.
-- Atenção: o privilégio NÃO vinha de um GRANT para `anon` — vinha do GRANT
-- implícito para PUBLIC que o Postgres dá a toda função. Revogar de `anon` não
-- resolve; é preciso revogar de PUBLIC e devolver a quem precisa.
-- Nenhuma página pública chama RPC: todas as chamadas são server-side ou de
-- componente autenticado (EuthanasiaModal). Por isso revogar anon é seguro.

-- ── Views de compliance ─────────────────────────────────────────────────────
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'active_vets_with_crmv','audit_controlled_without_crmv','retention_audit',
    'data_subject_access_report','audit_euthanasia_compliance','chat_data_subject_report'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname=v) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
      IF v <> 'data_subject_access_report' THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', v);
      ELSE
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', v);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── Funções SECURITY DEFINER ────────────────────────────────────────────────
DO $$
DECLARE f record; n int := 0;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS a
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prosecdef
       AND pg_get_function_result(p.oid) NOT IN ('trigger','event_trigger')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public', f.a);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f.a);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.a);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'funcoes SECURITY DEFINER ajustadas: %', n;
END $$;
