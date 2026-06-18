-- 0396 — SaaS Fase 2 (R6/D5): máquina de estados da assinatura + grandfathering
-- Introduz lifecycle_state (gate de ativação de módulos por pagamento) e a flag
-- is_grandfathered. D5 (PO 2026-06-18): clientes JÁ ativos NUNCA são forçados a
-- pagar pelo novo gating — o backfill os marca active + grandfathered. O gating
-- (pending → módulos OFF até PAYMENT_CONFIRMED) vale só p/ novas adesões/opt-in.
-- Aditiva e idempotente.
BEGIN;

ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT;
ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS is_grandfathered BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tenant_subscriptions
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_lifecycle_state_check;
ALTER TABLE tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_lifecycle_state_check
  CHECK (lifecycle_state IS NULL OR lifecycle_state IN
    ('pending', 'active', 'past_due', 'grace', 'suspended', 'expiring', 'expired'));

COMMENT ON COLUMN tenant_subscriptions.lifecycle_state IS
  'Estado autoritativo de cobrança (Fase 2): pending→active→past_due→grace→suspended (mensal) e active→expiring→expired (anual). Gate da ativação de módulos. NULL = legado pré-Fase 2.';
COMMENT ON COLUMN tenant_subscriptions.is_grandfathered IS
  'D5: assinatura legada protegida — cliente que já tinha acesso e NÃO é forçado a preencher pagamento. Dunning/suspensão ignora grandfathered até opt-in de pagamento.';

-- ── Backfill D5 (idempotente: só preenche quem está NULL) ──────────────────
-- Toda assinatura paga já existente (não-free e não-cancelada) vira active +
-- grandfathered: mantém acesso sem exigir cartão. Free/cancelada → active
-- (free é sempre on; downgrade-para-free não tem o que cobrar).
UPDATE tenant_subscriptions
  SET lifecycle_state = 'active',
      is_grandfathered = true
  WHERE lifecycle_state IS NULL
    AND plan_name <> 'free'
    AND COALESCE(status, 'active') <> 'cancelled';

UPDATE tenant_subscriptions
  SET lifecycle_state = 'active'
  WHERE lifecycle_state IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_lifecycle
  ON tenant_subscriptions (lifecycle_state)
  WHERE lifecycle_state IS NOT NULL;

COMMIT;
