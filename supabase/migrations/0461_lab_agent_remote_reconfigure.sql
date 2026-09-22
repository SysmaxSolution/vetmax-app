-- 0461 — Promoção/repontamento remoto do agente-ponte de laboratório.
-- A equipe define no painel (Gestão › Laboratório) um destino pendente
-- (ambiente + url + token); no próximo ping o agente recebe a instrução,
-- reescreve seu config e passa a apontar para o novo ambiente — sem AnyDesk,
-- sem visita presencial. Aplicação é one-shot (limpa após entregue).

ALTER TABLE lab_agents
  ADD COLUMN IF NOT EXISTS last_env       TEXT,          -- ambiente que o agente reportou no último ping
  ADD COLUMN IF NOT EXISTS pending_env    TEXT,          -- destino solicitado (dev|prod)
  ADD COLUMN IF NOT EXISTS pending_url    TEXT,          -- base URL do destino
  ADD COLUMN IF NOT EXISTS pending_token  TEXT,          -- token de pareamento do destino
  ADD COLUMN IF NOT EXISTS pending_set_at TIMESTAMPTZ;
