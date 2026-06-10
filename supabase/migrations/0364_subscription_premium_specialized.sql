-- 0364 — Monetização SaaS Fase 1: planos premium/specialized + ciclo + payload
-- Estende tenant_subscriptions (0144). Migra vocabulário legado pro/enterprise
-- para specialized (contratos comerciais manuais — mesma semântica).
BEGIN;

-- 1. Remove o CHECK antigo (nome default do CHECK inline criado em 0144)
ALTER TABLE tenant_subscriptions
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_plan_name_check;

-- 2. Migra dados legados ANTES do CHECK novo (mesma transação — sem janela de violação)
UPDATE tenant_subscriptions
  SET plan_name = 'specialized'
  WHERE plan_name IN ('pro', 'enterprise');

-- 3. CHECK novo — trio oficial
ALTER TABLE tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_plan_name_check
  CHECK (plan_name IN ('free', 'premium', 'specialized'));

-- 4. Colunas novas (aditivas, idempotentes)
ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT NULL;
ALTER TABLE tenant_subscriptions
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_billing_cycle_check;
ALTER TABLE tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_billing_cycle_check
  CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly', 'yearly'));
ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS payment_payload JSONB DEFAULT NULL;

COMMENT ON COLUMN tenant_subscriptions.billing_cycle IS
  'monthly | yearly (PIX anual com desconto). NULL para free/specialized sem ciclo definido.';
COMMENT ON COLUMN tenant_subscriptions.payment_payload IS
  'Fase 1 (sem gateway): payload dummy do checkout — termos aceitos, método simulado, totais calculados no servidor. Nunca armazenar dados reais/completos de cartão (apenas last4/brand).';

-- 5. Trigger touch updated_at (0144 não criou)
CREATE OR REPLACE FUNCTION fn_tenant_subscriptions_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_tenant_subscriptions_touch ON tenant_subscriptions;
CREATE TRIGGER trg_tenant_subscriptions_touch
  BEFORE UPDATE ON tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION fn_tenant_subscriptions_touch();

COMMIT;
