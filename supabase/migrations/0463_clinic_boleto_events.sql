-- 0463 — Trilha de auditoria/movimentação dos boletos. Cada ação vira um evento
-- (quem fez, quando, o quê, detalhamento do banco). Base do relatório de
-- movimentação. Sem policy de RLS: acesso só via service role.

CREATE TABLE IF NOT EXISTS clinic_boleto_events (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id    UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  boleto_id    UUID        NOT NULL REFERENCES clinic_boletos(id) ON DELETE CASCADE,
  event_type   TEXT        NOT NULL,   -- emitido|reimpresso|email_enviado|whatsapp_enviado|
                                       -- consulta|retorno_banco|instrucao|pago|baixado|erro
  actor_type   TEXT        NOT NULL DEFAULT 'user'  CHECK (actor_type IN ('user','bank','system')),
  actor_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name   TEXT,                   -- nome/rótulo de quem fez (usuário, "Banco Sicoob", "Sistema")
  detail       TEXT,                   -- descrição legível do que foi feito
  situacao     TEXT,                   -- situação do boleto no momento do evento
  payload      JSONB,                  -- detalhamento cru do banco (quando houver)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boleto_events_boleto ON clinic_boleto_events (boleto_id, created_at);
CREATE INDEX IF NOT EXISTS idx_boleto_events_clinic ON clinic_boleto_events (clinic_id, created_at DESC);

ALTER TABLE clinic_boleto_events ENABLE ROW LEVEL SECURITY;
-- Sem policy: acesso só via service role.
