-- 0368 — SaaS Fase 1.5: re-grade comercial (free | premium | enterprise | specialized)
-- Premium R$99 = bundle fixo (gatilhos WhatsApp, PDV, estoque c/ kits, internação simples;
-- 10 usuários / 10 documentos). Enterprise R$299 = tudo (ilimitado). A la carte: Premium
-- contrata módulos do bundle Enterprise a R$79,90. Specialized inalterado (sob medida).
BEGIN;

-- ── 1. plan_name ganha 'enterprise' (4 tiers) ────────────────────────────────
ALTER TABLE tenant_subscriptions
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_plan_name_check;
ALTER TABLE tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_plan_name_check
  CHECK (plan_name IN ('free', 'premium', 'enterprise', 'specialized'));

-- ── 2. Catálogo: tier de bundle (NULL = só avulso/legado) ────────────────────
ALTER TABLE subscription_module_catalog
  ADD COLUMN IF NOT EXISTS included_in_plan TEXT DEFAULT NULL;
ALTER TABLE subscription_module_catalog
  DROP CONSTRAINT IF EXISTS subscription_module_catalog_included_in_plan_check;
ALTER TABLE subscription_module_catalog
  ADD CONSTRAINT subscription_module_catalog_included_in_plan_check
  CHECK (included_in_plan IS NULL OR included_in_plan IN ('premium', 'enterprise'));
COMMENT ON COLUMN subscription_module_catalog.included_in_plan IS
  'Bundle que inclui o módulo: premium (incluso no Premium e acima) | enterprise (incluso no Enterprise; comprável avulso pelo Premium) | NULL (somente avulso/legado).';

-- ── 3. Config: preço base do Enterprise ──────────────────────────────────────
ALTER TABLE subscription_plan_config
  ADD COLUMN IF NOT EXISTS enterprise_base_price NUMERIC(12,2) NOT NULL DEFAULT 299.00;

-- ── 4. Migra contratos das keys comerciais antigas (split de bundles) ────────
-- Preserva is_active/contracted_at. DELETE (não desativar) das keys antigas:
-- key sem entrada no catálogo é tratada como "key técnica direta" pelo
-- gatekeeper e poluiria active_modules no próximo sync.
WITH mapping(old_key, new_key) AS (VALUES
  ('hospitalization_surgery', 'hospitalization_simple'),
  ('hospitalization_surgery', 'surgery_advanced'),
  ('advanced_stock',          'stock_kits'),
  ('advanced_stock',          'purchases_nfe'),
  ('finance_reports',         'finance_integrations'),
  ('finance_reports',         'reports'))
INSERT INTO clinic_contracted_modules (clinic_id, module_key, is_active, contracted_at)
SELECT m.clinic_id, mp.new_key, m.is_active, m.contracted_at
  FROM clinic_contracted_modules m
  JOIN mapping mp ON mp.old_key = m.module_key
ON CONFLICT (clinic_id, module_key) DO NOTHING;

DELETE FROM clinic_contracted_modules
  WHERE module_key IN ('hospitalization_surgery', 'advanced_stock', 'finance_reports');
DELETE FROM subscription_module_catalog
  WHERE module_key IN ('hospitalization_surgery', 'advanced_stock', 'finance_reports');

-- ── 5. Re-seed do catálogo (estrutura nova) ──────────────────────────────────
-- ON CONFLICT DO UPDATE sobrescreve estrutura e PREÇOS (re-grade do PO),
-- preservando is_available de linhas existentes (desativações manuais).
INSERT INTO subscription_module_catalog
  (module_key, label, description, monthly_price, is_available, sort_order,
   included_module_keys, flow_flags, included_in_plan) VALUES
  ('whatsapp_triggers', 'Gatilhos de WhatsApp',
     'Lembretes e confirmações automáticas de agendamento por WhatsApp.',
     0.00, TRUE, 10, ARRAY['whatsapp'], '{}', 'premium'),
  ('sales_pdv', 'Vendas (PDV Completo)',
     'PDV com catálogo, carrinho multi-item e integração com estoque.',
     0.00, TRUE, 20, ARRAY['sales'], '{}', 'premium'),
  ('stock_kits', 'Estoque com Kits',
     'Controle por lote/validade, ponto de reposição e kits/pacotes com baixa automática.',
     0.00, TRUE, 30, ARRAY['pharmacy'], '{}', 'premium'),
  ('hospitalization_simple', 'Internação Simples',
     'Kanban de internados e prescrição digital.',
     0.00, TRUE, 40, ARRAY['hospitalization'], '{}', 'premium'),
  ('whatsapp_ai', 'WhatsApp IA (Bot)',
     'Bot de agendamento 24/7, triagem inteligente e campanhas de retorno.',
     79.90, TRUE, 50, ARRAY['whatsapp_intelligent'], '{}', 'enterprise'),
  ('surgery_advanced', 'Internação Completa + Centro Cirúrgico',
     'Internação avançada (sinais vitais, fluidoterapia) e bloco cirúrgico Preparo/Sala/RPA com ficha anestésica.',
     79.90, TRUE, 60, ARRAY['surgery'], ARRAY['internacao_completa','centro_cirurgico'], 'enterprise'),
  ('petlove', 'Integração PetLove',
     'Conciliação centavo-a-centavo da remessa mensal PetLove.',
     79.90, TRUE, 70, ARRAY['petlove_reconciliation'], '{}', 'enterprise'),
  ('tef_integration', 'TEF (cartões integrados)',
     'Pagamento com cartão integrado ao caixa via pinpad (em breve).',
     79.90, FALSE, 80, '{}', ARRAY['tef_integration'], 'enterprise'),
  ('billing_nfse', 'Faturamento e NFS-e',
     'Orçamentos, documentos de faturamento e emissão de NFS-e (Focus NFe).',
     79.90, TRUE, 90, ARRAY['billing'], '{}', 'enterprise'),
  ('finance_integrations', 'Integrações Financeiras',
     'DRE, fluxo de caixa, contas a pagar/receber, conciliação e recebíveis de cartão.',
     79.90, TRUE, 100, ARRAY['financial'], '{}', 'enterprise'),
  ('reports', 'Relatórios Gerenciais',
     'Relatórios gerenciais e exportação para apresentação.',
     79.90, TRUE, 110, ARRAY['reports'], '{}', 'enterprise'),
  ('purchases_nfe', 'Compras e NF-e',
     'Importação de NF-e XML de fornecedores e pedidos de compra.',
     79.90, TRUE, 120, ARRAY['purchases'], '{}', 'enterprise'),
  ('triage', 'Triagem',
     'Fila de triagem com sinais vitais por voz e anamnese guiada.',
     79.90, TRUE, 130, ARRAY['triage'], '{}', 'enterprise'),
  ('exams', 'Exames',
     'Solicitação digital, laudos assinados e PDF por WhatsApp.',
     79.90, TRUE, 140, ARRAY['exams'], '{}', 'enterprise'),
  ('grooming', 'Banho e Tosa',
     'Agenda e fluxo completo de estética animal.',
     79.90, TRUE, 150, ARRAY['grooming'], '{}', 'enterprise'),
  ('internal_chat', 'Chat Interno',
     'Mensagens em tempo real, salas por atendimento e anexos.',
     79.90, TRUE, 160, ARRAY['internal_chat'], '{}', 'enterprise')
ON CONFLICT (module_key) DO UPDATE SET
  label                = EXCLUDED.label,
  description          = EXCLUDED.description,
  monthly_price        = EXCLUDED.monthly_price,
  sort_order           = EXCLUDED.sort_order,
  included_module_keys = EXCLUDED.included_module_keys,
  flow_flags           = EXCLUDED.flow_flags,
  included_in_plan     = EXCLUDED.included_in_plan;

-- ── 6. Quota de documentos personalizados por plano ──────────────────────────
-- Estoque (sem reset): reset_date NULL. free=3, premium=10, demais ilimitado.
INSERT INTO tenant_quotas (clinic_id, resource_name, limit_amount, reset_date)
SELECT c.id, 'custom_documents',
       CASE COALESCE(s.plan_name, 'free')
         WHEN 'free'    THEN 3
         WHEN 'premium' THEN 10
         ELSE 999999 END,
       NULL
  FROM clinics c
  LEFT JOIN tenant_subscriptions s ON s.clinic_id = c.id
ON CONFLICT (clinic_id, resource_name) DO NOTHING;

-- ── 7. user_limit: clínicas free voltam ao padrão 3 (specialized intocado) ───
UPDATE clinics c
   SET user_limit = 3
  FROM tenant_subscriptions s
 WHERE s.clinic_id = c.id
   AND s.plan_name = 'free'
   AND c.user_limit IS DISTINCT FROM 3;

-- ── 8. auto_provision_tenant: novas clínicas free ganham custom_documents=3 ──
-- Corpo idêntico ao 0189 (early-return is_legacy) + a linha de quota nova.
CREATE OR REPLACE FUNCTION public.auto_provision_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Refator freemium 2026-05-26: legacy = importação manual / contrato pré-
  -- existente. NÃO toca em plan/flags/quotas/user_limit — fica como o
  -- suporte configurou.
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
      -- SaaS Fase 1.5: documentos personalizados são estoque (sem reset)
      (NEW.id, 'custom_documents',  3,     NULL,                                      NULL)
    ON CONFLICT (clinic_id, resource_name) DO NOTHING;

  -- Free plan: limite de 3 usuários (override do default)
  UPDATE clinics
    SET user_limit = 3
    WHERE id = NEW.id
      AND (user_limit IS NULL OR user_limit > 3);

  RETURN NEW;
END;
$function$;

COMMIT;
