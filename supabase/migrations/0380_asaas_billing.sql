-- ════════════════════════════════════════════════════════════════════════════
-- 0380 — Monetização SaaS Fase 2: integração Asaas (gateway real)
-- ════════════════════════════════════════════════════════════════════════════
-- A Sysmax Software é a merchant (UMA conta Asaas). Cada clínica vira um
-- `customer` no Asaas; cada plano pago vira uma `subscription` recorrente.
--   • Mensal  → cartão (débito automático) OU PIX (QR mensal)
--   • Anual   → PIX com 20% off (valor já descontado no servidor)
--
-- Aditiva e idempotente (IF NOT EXISTS), conforme regra de migrations.
-- Não armazenamos dados completos de cartão — apenas referências do Asaas.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Referências do Asaas na assinatura do tenant
ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS asaas_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_status   TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_at       TIMESTAMPTZ;

COMMENT ON COLUMN tenant_subscriptions.asaas_customer_id IS
  'ID do customer no Asaas (cus_...). Uma clínica = um customer na conta da Sysmax.';
COMMENT ON COLUMN tenant_subscriptions.asaas_subscription_id IS
  'ID da subscription recorrente no Asaas (sub_...).';
COMMENT ON COLUMN tenant_subscriptions.last_payment_status IS
  'Último status de pagamento vindo do webhook: CONFIRMED|RECEIVED|OVERDUE|REFUNDED...';

-- Índice p/ reconciliação reversa (webhook → tenant pelo customer/subscription)
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_asaas_customer
  ON tenant_subscriptions (asaas_customer_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_asaas_subscription
  ON tenant_subscriptions (asaas_subscription_id);

-- 2. Histórico de cobranças (uma linha por payment do Asaas / ciclo)
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- Referências Asaas
  asaas_payment_id   TEXT NOT NULL UNIQUE,   -- pay_... (idempotência do webhook)
  asaas_subscription_id TEXT,

  -- Snapshot da cobrança
  billing_type       TEXT,                   -- CREDIT_CARD | PIX | BOLETO | UNDEFINED
  value              NUMERIC(12,2) NOT NULL,
  status             TEXT NOT NULL,          -- PENDING|CONFIRMED|RECEIVED|OVERDUE|REFUNDED...
  due_date           DATE,
  paid_at            TIMESTAMPTZ,

  -- Links úteis devolvidos pelo Asaas (fatura/QR PIX)
  invoice_url        TEXT,
  pix_qr_payload     TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscription_invoices IS
  'Histórico de cobranças da assinatura SaaS por clínica, alimentado pelo webhook do Asaas. asaas_payment_id é UNIQUE p/ idempotência.';

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_clinic
  ON subscription_invoices (clinic_id);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_subscription
  ON subscription_invoices (asaas_subscription_id);

-- 3. RLS — isolamento por tenant (escrita real vem do admin client no webhook)
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_subscription_invoices" ON subscription_invoices;
CREATE POLICY "clinic_isolation_subscription_invoices"
  ON subscription_invoices FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- 4. updated_at touch
CREATE OR REPLACE FUNCTION fn_subscription_invoices_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_subscription_invoices_touch ON subscription_invoices;
CREATE TRIGGER trg_subscription_invoices_touch
  BEFORE UPDATE ON subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION fn_subscription_invoices_touch();

COMMIT;
