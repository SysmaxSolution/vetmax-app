-- 0407 — SaaS: Plano Starter R$189/mês (veredito do conselho LLM 2026-06-22)
-- Adiciona 4º tier comercial entre Free e Premium. Remapeia módulos do catálogo
-- para refletir a estrutura aprovada. Reduz free user_limit de 3 para 2.
-- Aditiva e idempotente. Escrita via service_role.
BEGIN;

-- ── 1. tenant_subscriptions: aceita plan_name = 'starter' ────────────────────
ALTER TABLE tenant_subscriptions
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_plan_name_check;
ALTER TABLE tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_plan_name_check
  CHECK (plan_name IN ('free', 'starter', 'premium', 'enterprise', 'specialized'));

-- ── 2. subscription_module_catalog: aceita included_in_plan = 'starter' ──────
ALTER TABLE subscription_module_catalog
  DROP CONSTRAINT IF EXISTS subscription_module_catalog_included_in_plan_check;
ALTER TABLE subscription_module_catalog
  ADD CONSTRAINT subscription_module_catalog_included_in_plan_check
  CHECK (included_in_plan IS NULL OR included_in_plan IN ('starter', 'premium', 'enterprise'));

-- ── 3. subscription_plan_config: preço base do Starter ───────────────────────
ALTER TABLE subscription_plan_config
  ADD COLUMN IF NOT EXISTS starter_base_price NUMERIC(12,2) NOT NULL DEFAULT 189.00;
UPDATE subscription_plan_config SET starter_base_price = 189.00 WHERE id = 1;

-- ── 4. Remapeamento do catálogo de módulos ────────────────────────────────────
-- Starter: módulos do núcleo operacional (todos os MVs, inclusive solos)
UPDATE subscription_module_catalog SET
  included_in_plan = 'starter',
  monthly_price    = 0.00,
  sort_order       = CASE module_key
    WHEN 'whatsapp_triggers'    THEN 10
    WHEN 'sales_pdv'            THEN 20
    WHEN 'stock_kits'           THEN 30
    WHEN 'triage'               THEN 40
    WHEN 'whatsapp_ai'          THEN 50
    ELSE sort_order END
WHERE module_key IN ('whatsapp_triggers', 'sales_pdv', 'stock_kits', 'triage', 'whatsapp_ai');

-- Premium: Starter + módulos avançados (internação, cirurgia, convênio, NFS-e)
UPDATE subscription_module_catalog SET
  included_in_plan = 'premium',
  monthly_price    = 0.00,
  sort_order       = CASE module_key
    WHEN 'hospitalization_simple' THEN 10
    WHEN 'surgery_advanced'       THEN 20
    WHEN 'petlove'                THEN 30
    WHEN 'billing_nfse'           THEN 40
    ELSE sort_order END
WHERE module_key IN ('hospitalization_simple', 'surgery_advanced', 'petlove', 'billing_nfse');

-- Enterprise: demais módulos (chat, finanças, relatórios, compras, exames, estética, TEF)
UPDATE subscription_module_catalog SET
  included_in_plan = 'enterprise'
WHERE module_key IN (
  'internal_chat', 'finance_integrations', 'reports',
  'purchases_nfe', 'exams', 'grooming', 'tef_integration'
);

-- ── 5. Free user_limit: 3 → 2 (upgrade urgency) ──────────────────────────────
UPDATE clinics c
   SET user_limit = 2
  FROM tenant_subscriptions s
 WHERE s.clinic_id = c.id
   AND (s.plan_name = 'free' OR s.plan_name IS NULL)
   AND (c.user_limit IS DISTINCT FROM 2);

-- ── 6. auto_provision_tenant: free ganha user_limit = 2 ──────────────────────
CREATE OR REPLACE FUNCTION public.auto_provision_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_legacy IS TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO tenant_subscriptions (clinic_id, plan_name, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (clinic_id) DO NOTHING;

  INSERT INTO tenant_feature_flags (clinic_id)
    VALUES (NEW.id)
    ON CONFLICT (clinic_id) DO NOTHING;

  INSERT INTO tenant_quotas (clinic_id, resource_name, limit_amount, reset_date, reset_interval)
    VALUES
      (NEW.id, 'whatsapp_messages', 100,   (CURRENT_DATE + INTERVAL '1 month')::date, 'monthly'),
      (NEW.id, 'ai_mentor_tokens',  50000, (CURRENT_DATE + INTERVAL '1 month')::date, 'monthly'),
      (NEW.id, 'ai_mentor_daily',   1,     (CURRENT_DATE + INTERVAL '1 day')::date,   'daily'),
      (NEW.id, 'custom_documents',  3,     NULL,                                       'monthly')
    ON CONFLICT (clinic_id, resource_name) DO NOTHING;

  -- 0407: free user_limit = 2 (era 3; reduzido para criar urgência de upgrade)
  UPDATE clinics
    SET user_limit = 2
    WHERE id = NEW.id
      AND (user_limit IS NULL OR user_limit > 2);

  RETURN NEW;
END;
$function$;

-- ── 7. Quota de documentos para novas clínicas Starter (5 docs) ──────────────
-- Clínicas existentes no plano starter (se houver) recebem 5 docs.
INSERT INTO tenant_quotas (clinic_id, resource_name, limit_amount, reset_date, reset_interval)
SELECT c.id, 'custom_documents', 5, NULL, 'monthly'
  FROM clinics c
  JOIN tenant_subscriptions s ON s.clinic_id = c.id
 WHERE s.plan_name = 'starter'
ON CONFLICT (clinic_id, resource_name) DO UPDATE
  SET limit_amount = EXCLUDED.limit_amount;

COMMIT;
