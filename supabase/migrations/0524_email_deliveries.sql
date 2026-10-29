-- 0524 — Registro de envios de e-mail (Resend) por clínica.
--
-- Em 28/10/2026 um convite de usuário não chegou e ninguém soube: a chave do
-- serviço de e-mail tinha sido revogada em 15/10 e a tela mostrava "Link de
-- convite gerado!" como se tudo estivesse certo. Não havia onde olhar.
--
-- Esta tabela guarda cada tentativa (convite, exame não realizado, imagens/laudo
-- ao veterinário solicitante) com o resultado imediato do provedor e os eventos
-- que o webhook do Resend devolve depois (entregue, atrasado, devolvido,
-- marcado como spam). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS email_deliveries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID        REFERENCES clinics(id) ON DELETE CASCADE,   -- NULL = e-mail do sistema sem clínica
  kind                TEXT        NOT NULL,                                    -- convite | exame_rejeitado | imagens_disponiveis | laudo_liberado | outro
  recipient           TEXT        NOT NULL,
  subject             TEXT,
  provider            TEXT        NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  status              TEXT        NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','sent','delivered','delayed','bounced','complained','failed','suppressed')),
  error               TEXT,
  reference_id        UUID,                                                   -- convite, estudo de imagem, exame…
  last_event          TEXT,
  last_event_at       TIMESTAMPTZ,
  opened_at           TIMESTAMPTZ,
  clicked_at          TIMESTAMPTZ,
  created_by          UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_clinic_created
  ON email_deliveries (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_recipient
  ON email_deliveries (clinic_id, recipient, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_deliveries_provider_message
  ON email_deliveries (provider, provider_message_id) WHERE provider_message_id IS NOT NULL;

COMMENT ON TABLE  email_deliveries IS 'Cada tentativa de e-mail transacional e o que o provedor devolveu (imediato + webhook).';
COMMENT ON COLUMN email_deliveries.status IS 'queued→sent (aceito pelo Resend)→delivered | delayed | bounced | complained | suppressed; failed = recusado na hora (chave inválida, domínio, etc.).';

-- Leitura pela clínica (tela de usuários mostra o estado do convite); escrita só pelo servidor.
ALTER TABLE email_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_deliveries_select_clinic" ON email_deliveries;
CREATE POLICY "email_deliveries_select_clinic"
  ON email_deliveries FOR SELECT TO authenticated
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
REVOKE ALL ON TABLE email_deliveries FROM anon;
