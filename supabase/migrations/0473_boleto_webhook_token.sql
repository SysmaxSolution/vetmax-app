-- 0473 — Identificação inequívoca da clínica no webhook de cobrança Sicoob.
--
-- Problema: `next_nosso_numero` (0462) é sequencial POR CONTA BANCÁRIA e começa
-- em 1, logo duas clínicas têm o mesmo `nosso_numero` com quase certeza. O
-- webhook buscava o boleto só por `nosso_numero` e pegava o mais recente —
-- podia dar baixa no título da clínica errada.
--
-- Solução: cada conta bancária ganha um token de callback próprio. A URL
-- registrada no banco passa a ser
--   /api/webhooks/sicoob-cobranca?key=<SICOOB_WEBHOOK_SECRET>&conta=<token>
-- e o webhook resolve (clinic_id, bank_account_id) pelo token antes de casar o
-- nosso número. Sem token, a rota cai no modo de desambiguação por payload e
-- FALHA explicitamente quando há mais de um candidato.
--
-- Aditiva, idempotente, sem trigger e sem backfill: colunas NULL por padrão.

ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS boleto_webhook_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_accounts_boleto_webhook_token
  ON bank_accounts (boleto_webhook_token)
  WHERE boleto_webhook_token IS NOT NULL;
