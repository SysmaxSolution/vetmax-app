-- 0219 — Backfill: Chat Interno virou módulo gerenciável
--
-- Até a sprint 2026-06-02, a aba "Chat Interno" não tinha moduleKey no
-- DashboardHeader — aparecia sempre que o user tinha role compatível,
-- independente de active_modules. A partir desta sprint ela passa a
-- exigir 'internal_chat' em clinics.active_modules.
--
-- Para não derrubar a feature de clientes Pro/Enterprise que já a usavam,
-- adicionamos 'internal_chat' ao active_modules de todas as clínicas
-- com plano pago. Clientes Free ficam sem essa key — para eles a tab
-- aparece com cadeado (PROMOTED_LOCKED_FEATURES) e abre UpgradeModal.

BEGIN;

UPDATE clinics c
SET active_modules = active_modules || '["internal_chat"]'::jsonb,
    updated_at     = NOW()
FROM tenant_subscriptions s
WHERE s.clinic_id = c.id
  AND s.plan_name IN ('pro', 'enterprise')
  AND s.status IN ('active', 'trialing')
  AND NOT (c.active_modules ? 'internal_chat');

-- Audit: relata quantas clínicas tiveram a key adicionada (best-effort,
-- não bloqueia a migration se a tabela de log não existir).
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[0219] internal_chat adicionado a active_modules em % clínica(s) Pro/Enterprise', v_count;
END $$;

COMMIT;
