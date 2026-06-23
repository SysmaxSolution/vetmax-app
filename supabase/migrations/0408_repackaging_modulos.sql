-- 0408 — Re-packaging de módulos por plano (Diretor + llm-council 2026-06-23)
-- Fonte de verdade: SPRINT_PLAN_REPACKAGING_MODULOS_2026-06-23.md
-- Backbone enforçável por MÓDULO. Sub-flags (caixa simples/completo, estoque
-- básico/completo, recepção c/ agenda) entram via flow_config em 0409.
-- Aditiva e idempotente. Escrita via service_role.
BEGIN;

-- ── 1. Re-tiering do catálogo comercial (included_in_plan) ───────────────────
-- WhatsApp IA: Starter → Premium (joia/upsell; conserta cobrança dupla)
UPDATE subscription_module_catalog
   SET included_in_plan = 'premium', sort_order = 30
 WHERE module_key = 'whatsapp_ai';

-- Compras NF-e: Enterprise → Premium (Módulo de Compras no Premium)
UPDATE subscription_module_catalog
   SET included_in_plan = 'premium', monthly_price = 0.00, sort_order = 40
 WHERE module_key = 'purchases_nfe';

-- Internação Avançada + Centro Cirúrgico: Premium → Enterprise
UPDATE subscription_module_catalog
   SET included_in_plan = 'enterprise', sort_order = 10
 WHERE module_key = 'surgery_advanced';

-- Petlove: Premium → Enterprise (Petlove Integrada no Enterprise)
UPDATE subscription_module_catalog
   SET included_in_plan = 'enterprise', monthly_price = 0.00, sort_order = 20
 WHERE module_key = 'petlove';

-- ── 2. NFS-e / Faturamento: incluso no Premium + ADD-ON do Starter R$49 ───────
-- Mantém included_in_plan='premium' (bundle Premium) e fixa o preço de add-on
-- que o Starter pode contratar individualmente (lógica no subscribeToPlan).
UPDATE subscription_module_catalog
   SET monthly_price = 49.00, sort_order = 20
 WHERE module_key = 'billing_nfse';

-- Internação Simples permanece no Premium (sort 10 do bloco premium-clínico)
UPDATE subscription_module_catalog
   SET included_in_plan = 'premium', sort_order = 10
 WHERE module_key = 'hospitalization_simple';

-- Reordena o bloco Starter (módulos do núcleo operacional pago)
UPDATE subscription_module_catalog SET sort_order = 10 WHERE module_key = 'whatsapp_triggers';
UPDATE subscription_module_catalog SET sort_order = 20 WHERE module_key = 'sales_pdv';
UPDATE subscription_module_catalog SET sort_order = 30 WHERE module_key = 'stock_kits';
UPDATE subscription_module_catalog SET sort_order = 40 WHERE module_key = 'triage';

-- Reordena o bloco Enterprise restante
UPDATE subscription_module_catalog SET sort_order = 30 WHERE module_key = 'internal_chat';
UPDATE subscription_module_catalog SET sort_order = 40 WHERE module_key = 'finance_integrations';
UPDATE subscription_module_catalog SET sort_order = 50 WHERE module_key = 'reports';
UPDATE subscription_module_catalog SET sort_order = 60 WHERE module_key = 'exams';
UPDATE subscription_module_catalog SET sort_order = 70 WHERE module_key = 'grooming';
UPDATE subscription_module_catalog SET sort_order = 80 WHERE module_key = 'tef_integration';

-- ── 3. Premium user_limit: 999 → 20 (nas premium ativas) ─────────────────────
UPDATE clinics c
   SET user_limit = 20
  FROM tenant_subscriptions s
 WHERE s.clinic_id = c.id
   AND s.plan_name = 'premium'
   AND (c.user_limit IS DISTINCT FROM 20);

-- ── 4. Caixa OFF no Free ──────────────────────────────────────────────────────
-- 4a. Atualiza o seed de novas clínicas (remove 'cashier' dos arrays)
CREATE OR REPLACE FUNCTION fn_seed_clinic_freemium_modules(
  p_clinic_id     UUID,
  p_business_type TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_modules TEXT[];
BEGIN
  IF p_business_type = 'pet_aesthetics' THEN
    -- estética: grooming é o núcleo; caixa vira recurso pago (Starter+)
    v_modules := ARRAY['reception','patients','grooming','management'];
  ELSE
    -- vet_clinic (default): recepção + prontuário/pacientes + consultório
    v_modules := ARRAY['reception','patients','consultation','management'];
  END IF;

  UPDATE clinics
  SET active_modules = to_jsonb(v_modules)
  WHERE id = p_clinic_id;
END;
$$;

COMMENT ON FUNCTION fn_seed_clinic_freemium_modules IS
  'Sobrescreve clinics.active_modules conforme business_type para um signup novo (plano Free SEM caixa, 0408). Espelha FREE_ROUTES em src/config/access-matrix.ts.';

-- 4b. Remove 'cashier' das clínicas FREE existentes (preserva pagantes/parceiras)
UPDATE clinics c
   SET active_modules = COALESCE(
        (SELECT jsonb_agg(elem)
           FROM jsonb_array_elements(c.active_modules) elem
          WHERE elem <> '"cashier"'::jsonb),
        '[]'::jsonb)
  FROM tenant_subscriptions s
 WHERE s.clinic_id = c.id
   AND (s.plan_name = 'free' OR s.plan_name IS NULL)
   AND c.active_modules @> '["cashier"]'::jsonb;

COMMIT;
