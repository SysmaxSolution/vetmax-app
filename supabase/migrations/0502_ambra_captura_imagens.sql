-- 0502: captura de imagens da Ambra (PACS em nuvem) — item 3.5 da Fase 3.
--
-- A Ambra guarda as imagens; nós nunca trafegamos nem armazenamos DICOM. O que
-- guardamos é o LINK do visualizador deles, obtido por API, e o accession que
-- amarra o estudo lá ao nosso estudo aqui.
--
-- Três objetos:
--
-- 1. `clinic_ambra_config` — credencial por clínica. Segue o padrão das outras
--    integrações (clinic_bank_integrations, clinic_whatsapp_settings): tabela
--    dedicada, RLS ligado com ZERO políticas, acesso só pelo service_role das
--    server actions. A senha vai cifrada; o `phi_namespace` e o `account_id`
--    são informados pela própria Ambra ao criar o usuário de integração.
--
-- 2. Colunas em `imaging_studies` — o estudo já existe desde a Fase 3 (Portal
--    em produção). Só acrescentamos o vínculo com a Ambra.
--
-- 3. `ambra_webhook_events` — tudo que a Ambra nos manda, append-only. Serve
--    para auditoria, para reprocessar e, principalmente, para guardar o evento
--    que NÃO casou com nenhum estudo: sem isso o operador não teria como saber
--    que chegou imagem de um exame que o sistema não reconheceu.
--
-- Aditiva e idempotente.

-- ─── 1. credencial por clínica ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_ambra_config (
  clinic_id           UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  enabled             BOOLEAN NOT NULL DEFAULT false,
  base_url            TEXT    NOT NULL DEFAULT 'https://access.ambrahealth.com',
  login               TEXT,
  password_encrypted  TEXT,
  phi_namespace       TEXT,
  account_id          TEXT,

  -- Segredo NOSSO, no caminho do webhook. A Ambra não assina a chamada (não há
  -- HMAC nem segredo documentado na API v3), então sem isto qualquer um que
  -- descubra a URL forja "imagem chegou" e publica link no portal do tutor.
  webhook_secret      TEXT,
  webhook_id          TEXT,

  -- Validade e teto de uso do link. O link vai por WhatsApp para tutor e vet
  -- parceiro; link eterno e de uso ilimitado circulando em WhatsApp é vazamento
  -- de imagem médica esperando acontecer. 7 dias e 50 acessos por padrão.
  link_minutes_alive  INTEGER NOT NULL DEFAULT 10080,
  link_max_hits       INTEGER NOT NULL DEFAULT 50,
  -- E-mails avisados a cada acesso ao link (parâmetro `notify` do /link/add).
  notify_emails       TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clinic_ambra_config ENABLE ROW LEVEL SECURITY;
-- Zero políticas de propósito: nega tudo para anon e authenticated. Quem lê é o
-- service_role, que ignora RLS. Mesmo desenho da 0490 (certificados bancários).
REVOKE ALL ON TABLE clinic_ambra_config FROM anon;

-- ─── 2. vínculo do estudo com a Ambra ───────────────────────────────────────
ALTER TABLE imaging_studies
  ADD COLUMN IF NOT EXISTS accession_number     TEXT,
  ADD COLUMN IF NOT EXISTS ambra_study_uuid     TEXT,
  ADD COLUMN IF NOT EXISTS ambra_link_url       TEXT,
  ADD COLUMN IF NOT EXISTS ambra_link_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ambra_synced_at      TIMESTAMPTZ;

COMMENT ON COLUMN imaging_studies.accession_number IS
  'Accession que NÓS geramos e que o aparelho envia junto com as imagens. É a chave '
  'que casa o estudo na Ambra com o estudo aqui. Enquanto a worklist ASL (item 3.1) '
  'não existir, é digitado pelo operador no aparelho.';

-- Índice NÃO único: um exame refeito pode repetir o accession, e uma restrição
-- única aqui bloquearia o reenvio em vez de nos avisar. A resolução pega o mais
-- recente.
CREATE INDEX IF NOT EXISTS idx_imaging_studies_accession
  ON imaging_studies (clinic_id, accession_number)
  WHERE accession_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_imaging_studies_ambra_uuid
  ON imaging_studies (ambra_study_uuid)
  WHERE ambra_study_uuid IS NOT NULL;

-- ─── 3. trilha dos eventos recebidos ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ambra_webhook_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         UUID REFERENCES clinics(id) ON DELETE CASCADE,
  event             TEXT NOT NULL,
  accession_number  TEXT,
  study_uid         TEXT,
  ambra_study_uuid  TEXT,
  -- NULL = chegou imagem que não casou com estudo nenhum. É o caso que o
  -- operador precisa ver na tela para amarrar à mão.
  study_id          UUID REFERENCES imaging_studies(id) ON DELETE SET NULL,
  payload           JSONB NOT NULL,
  processed_at      TIMESTAMPTZ,
  error             TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ambra_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ambra_webhook_events FROM anon;

CREATE INDEX IF NOT EXISTS idx_ambra_events_pendentes
  ON ambra_webhook_events (clinic_id, received_at DESC)
  WHERE study_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ambra_events_estudo
  ON ambra_webhook_events (study_id, received_at DESC)
  WHERE study_id IS NOT NULL;
