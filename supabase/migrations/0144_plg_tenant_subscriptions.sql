-- PLG Sprint 1 — Planos e assinaturas por tenant
-- Um registro por clínica. Gerenciado via service_role ao mudar de plano.

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  plan_name     TEXT        NOT NULL DEFAULT 'free'
                            CHECK (plan_name IN ('free', 'pro', 'enterprise')),
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled')),
  custom_price  NUMERIC(10,2)   DEFAULT NULL,
  trial_ends_at      TIMESTAMPTZ DEFAULT NULL,
  current_period_end TIMESTAMPTZ DEFAULT NULL,
  cancelled_at       TIMESTAMPTZ DEFAULT NULL,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_subscriptions_clinic_id_key UNIQUE (clinic_id)
);

COMMENT ON TABLE tenant_subscriptions IS
  'Plano ativo por tenant. Um registro por clínica (1:1). Gerenciado via service_role.';
COMMENT ON COLUMN tenant_subscriptions.custom_price IS
  'Preço negociado para contratos Enterprise. NULL = preço padrão tabelado do plano.';
COMMENT ON COLUMN tenant_subscriptions.trial_ends_at IS
  'Data de fim do trial. NULL = sem trial ativo.';
COMMENT ON COLUMN tenant_subscriptions.current_period_end IS
  'Fim do período de cobrança corrente. Necessário para cálculo pro-rata e renovação.';
COMMENT ON COLUMN tenant_subscriptions.cancelled_at IS
  'Timestamp do cancelamento. NULL = assinatura ativa. Preserva histórico temporal.';

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_clinic_id
  ON tenant_subscriptions(clinic_id);

-- RLS: leitura apenas para membros da própria clínica
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_subscriptions_select_own"
  ON tenant_subscriptions FOR SELECT
  USING (
    clinic_id = (
      SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- Seed: provisiona plano Free para todas as clínicas existentes
INSERT INTO tenant_subscriptions (clinic_id, plan_name, status)
  SELECT id, 'free', 'active' FROM clinics
  ON CONFLICT (clinic_id) DO NOTHING;
