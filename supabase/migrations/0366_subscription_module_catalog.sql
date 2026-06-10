-- 0366 — Monetização SaaS Fase 1: catálogo de módulos a la carte + config de pricing
-- Tabelas GLOBAIS (sem clinic_id). Leitura para authenticated; escrita só service_role.
-- included_module_keys/flow_flags traduzem a chave comercial para as camadas técnicas
-- (clinics.active_modules / clinics.flow_config).
BEGIN;

CREATE TABLE IF NOT EXISTS subscription_module_catalog (
  module_key           TEXT          PRIMARY KEY,
  label                TEXT          NOT NULL,
  description          TEXT          NOT NULL DEFAULT '',
  monthly_price        NUMERIC(12,2) NOT NULL DEFAULT 49.00,
  is_available         BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order           INTEGER       NOT NULL DEFAULT 100,
  included_module_keys TEXT[]        NOT NULL DEFAULT '{}',
  flow_flags           TEXT[]        NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscription_module_catalog IS
  'Catálogo global dos módulos a la carte do plano Premium. Preços placeholder editáveis sem deploy. included_module_keys expande para clinics.active_modules; flow_flags para clinics.flow_config.';

ALTER TABLE subscription_module_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "module_catalog_select_all" ON subscription_module_catalog;
CREATE POLICY "module_catalog_select_all"
  ON subscription_module_catalog FOR SELECT TO authenticated USING (true);
-- escrita só service_role (sem policies de escrita)

CREATE OR REPLACE FUNCTION fn_subscription_module_catalog_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_subscription_module_catalog_touch ON subscription_module_catalog;
CREATE TRIGGER trg_subscription_module_catalog_touch
  BEFORE UPDATE ON subscription_module_catalog
  FOR EACH ROW EXECUTE FUNCTION fn_subscription_module_catalog_touch();

-- Config global de pricing do Premium (linha única, id=1)
CREATE TABLE IF NOT EXISTS subscription_plan_config (
  id                      SMALLINT      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  premium_base_price      NUMERIC(12,2) NOT NULL DEFAULT 99.00,
  annual_discount_percent NUMERIC(5,2)  NOT NULL DEFAULT 20.00,
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);
COMMENT ON TABLE subscription_plan_config IS
  'Config global de pricing do plano Premium (linha única, id=1). Editável via SQL/painel sem deploy.';

ALTER TABLE subscription_plan_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan_config_select_all" ON subscription_plan_config;
CREATE POLICY "plan_config_select_all"
  ON subscription_plan_config FOR SELECT TO authenticated USING (true);

INSERT INTO subscription_plan_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Seed do catálogo (ON CONFLICT DO NOTHING — não sobrescreve preços editados)
INSERT INTO subscription_module_catalog
  (module_key, label, description, monthly_price, sort_order, included_module_keys, flow_flags) VALUES
  ('hospitalization_surgery', 'Internação e Cirurgia',
     'Kanban de internados, prescrição digital, bloco cirúrgico Preparo, Sala e RPA e ficha anestésica.',
     49.00, 10, ARRAY['hospitalization','surgery'], ARRAY['internacao_completa','centro_cirurgico']),
  ('advanced_stock', 'Estoque Avançado (Farmácia e Compras)',
     'Controle por lote/validade, ponto de reposição, kits e importação de NF-e de fornecedores.',
     49.00, 20, ARRAY['pharmacy','purchases'], '{}'),
  ('billing_nfse', 'Faturamento e NFS-e',
     'Orçamentos de serviço, documentos de faturamento e emissão de NFS-e integrada (Focus NFe).',
     49.00, 30, ARRAY['billing'], '{}'),
  ('triage', 'Triagem',
     'Fila de triagem com sinais vitais por voz e anamnese guiada.',
     49.00, 40, ARRAY['triage'], '{}'),
  ('exams', 'Exames',
     'Solicitação digital, laudos com assinatura eletrônica e PDF por WhatsApp.',
     49.00, 50, ARRAY['exams'], '{}'),
  ('grooming', 'Banho e Tosa',
     'Agenda e fluxo completo de estética animal.',
     49.00, 60, ARRAY['grooming'], '{}'),
  ('whatsapp_ai', 'WhatsApp IA',
     'Bot de agendamento 24/7, confirmações automáticas e campanhas de retorno.',
     49.00, 70, ARRAY['whatsapp_intelligent'], '{}'),
  ('internal_chat', 'Chat Interno',
     'Mensagens em tempo real, salas automáticas por atendimento e anexos.',
     49.00, 80, ARRAY['internal_chat'], '{}'),
  ('finance_reports', 'Financeiro e Relatórios',
     'DRE, fluxo de caixa, contas a pagar/receber e relatórios gerenciais exportáveis.',
     49.00, 90, ARRAY['financial','reports'], '{}'),
  ('sales_pdv', 'Vendas (PDV Completo)',
     'PDV com catálogo, carrinho multi-item e integração com estoque.',
     49.00, 100, ARRAY['sales'], '{}')
ON CONFLICT (module_key) DO NOTHING;

COMMIT;
