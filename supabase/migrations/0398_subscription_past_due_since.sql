-- 0398 — SaaS Fase 2 (R7 dunning): âncora temporal da inadimplência.
-- past_due_since marca QUANDO a assinatura entrou em atraso (evento OVERDUE do
-- webhook). O cron de dunning usa essa data para a transição past_due → grace
-- após 7 dias. NULL = em dia / regularizado (activatePaidSubscription limpa).
-- A expiração do anual usa current_period_end (já existente) — não precisa de
-- coluna nova. Aditiva e idempotente.
BEGIN;

ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ;

COMMENT ON COLUMN tenant_subscriptions.past_due_since IS
  'R7: instante em que a assinatura ficou inadimplente (1º OVERDUE). Base dos +7 dias até a carência (grace). NULL = em dia.';

COMMIT;
