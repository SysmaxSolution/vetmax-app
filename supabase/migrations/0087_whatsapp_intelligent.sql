-- ============================================================
-- 0087_whatsapp_intelligent
-- Tabelas para o sistema de bot WhatsApp Inteligente
-- ============================================================

-- Adiciona nome da instância Evolution API (único por clínica)
ALTER TABLE clinic_whatsapp_settings
  ADD COLUMN IF NOT EXISTS evolution_instance_name text;

-- ── whatsapp_bot_config ──────────────────────────────────────
-- Configuração de personalidade e comportamento do bot por clínica

CREATE TABLE IF NOT EXISTS whatsapp_bot_config (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id            uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  personality_prompt   text,
  can_book             boolean     NOT NULL DEFAULT false,
  can_inform_prices    boolean     NOT NULL DEFAULT false,
  working_hours_start  time,
  working_hours_end    time,
  is_active            boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wpp_bot_config_clinic
  ON whatsapp_bot_config (clinic_id);

ALTER TABLE whatsapp_bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpp_bot_config_clinic_isolation" ON whatsapp_bot_config
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- ── whatsapp_conversations ────────────────────────────────────
-- Conversas entre o bot e tutores (uma conversa ativa por número por clínica)

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  tutor_phone     text        NOT NULL,
  tutor_name      text,
  pet_name        text,
  status          text        NOT NULL DEFAULT 'bot'
                              CHECK (status IN ('bot', 'human', 'closed')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpp_conversations_clinic_status
  ON whatsapp_conversations (clinic_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_wpp_conversations_clinic_phone
  ON whatsapp_conversations (clinic_id, tutor_phone);

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpp_conversations_clinic_isolation" ON whatsapp_conversations
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- ── whatsapp_messages ─────────────────────────────────────────
-- Mensagens individuais de cada conversa

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid        NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  clinic_id       uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  direction       text        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content         text        NOT NULL,
  sent_by         text        NOT NULL CHECK (sent_by IN ('bot', 'human', 'client')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpp_messages_conversation
  ON whatsapp_messages (conversation_id, created_at DESC);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpp_messages_clinic_isolation" ON whatsapp_messages
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- ── whatsapp_campaigns ────────────────────────────────────────
-- Campanhas de reativação automáticas por clínica

CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  trigger_type    text        NOT NULL
                              CHECK (trigger_type IN ('no_visit', 'vaccine_due', 'pending_return', 'grooming_due')),
  days_threshold  int         NOT NULL DEFAULT 30,
  is_active       boolean     NOT NULL DEFAULT false,
  send_hour       int         NOT NULL DEFAULT 9 CHECK (send_hour BETWEEN 0 AND 23),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpp_campaigns_clinic
  ON whatsapp_campaigns (clinic_id);

ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpp_campaigns_clinic_isolation" ON whatsapp_campaigns
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- ── whatsapp_campaign_logs ────────────────────────────────────
-- Registro de disparos de campanhas para controle de reenvio e taxa de resposta

CREATE TABLE IF NOT EXISTS whatsapp_campaign_logs (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id         uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  tutor_id          uuid        REFERENCES tutors(id) ON DELETE SET NULL,
  campaign_id       uuid        REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  response_received boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_wpp_campaign_logs_clinic
  ON whatsapp_campaign_logs (clinic_id, sent_at DESC);

ALTER TABLE whatsapp_campaign_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpp_campaign_logs_clinic_isolation" ON whatsapp_campaign_logs
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );
