-- 0474 — Controle de execução diária do recall de vacina, por clínica.
--
-- O cron passou a ser configurável por clínica (hora local escolhida em
-- flow_config.vaccine_recall_hour). Para que a rotina se comporte igual tanto
-- num cron DE HORA EM HORA (produção/Pro) quanto num cron DIÁRIO (ambiente de
-- testes, onde a conta Vercel só permite cron diário), a rota precisa saber se
-- já rodou para aquela clínica naquele dia local.
--
-- Regra resultante: a clínica é atendida UMA vez por dia, na primeira execução
-- do cron em que a hora local já alcançou a hora configurada.
--
-- Aditiva e idempotente. Tabela pequena (1 linha por clínica por dia).

CREATE TABLE IF NOT EXISTS clinic_vaccine_recall_runs (
  clinic_id  UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  run_date   DATE        NOT NULL,           -- data LOCAL da clínica
  ran_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent       INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, run_date)
);

CREATE INDEX IF NOT EXISTS idx_vaccine_recall_runs_clinic
  ON clinic_vaccine_recall_runs (clinic_id, run_date DESC);

-- RLS ligada sem policy: acesso exclusivo por service_role (só o cron escreve).
-- Mesmo padrão documentado nas demais tabelas de infraestrutura do lote.
ALTER TABLE clinic_vaccine_recall_runs ENABLE ROW LEVEL SECURITY;
