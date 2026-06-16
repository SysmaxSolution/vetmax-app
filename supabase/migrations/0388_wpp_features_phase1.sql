-- 0388: WhatsApp Inteligente — Features 1, 4, 6, 7
-- Feature 1: Quem está atendendo (assigned_to)
-- Feature 4: Confirmação 24h de consultas
-- Feature 6: Urgência por palavra-chave
-- Feature 7: Consentimento LGPD por canal

ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS assigned_to       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_urgent         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_accepted_at  timestamptz;

-- Tracking de confirmações de consulta via WhatsApp (feature 4)
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS wpp_confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS wpp_confirmation_status  text
    CHECK (wpp_confirmation_status IN ('pending','confirmed','cancelled','no_reply'));

-- Palavras-chave de urgência configuráveis por clínica (feature 6)
-- Default: lista padrão; clínica pode sobrescrever
ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS wpp_urgency_keywords text[]
    DEFAULT ARRAY['convulsão','convulsao','sangramento','atropelado','não respira','nao respira',
                  'envenenado','envenenamento','inconsciência','inconsciente','dificuldade respiratoria',
                  'dificuldade respiratória','desmaio','paralisia','urgente','emergência','emergencia',
                  'socorro','engasgou','engasgado'];

-- Índices
CREATE INDEX IF NOT EXISTS idx_wpp_conv_urgent
  ON whatsapp_conversations (clinic_id, last_message_at DESC)
  WHERE is_urgent = true;

CREATE INDEX IF NOT EXISTS idx_wpp_conv_assigned
  ON whatsapp_conversations (assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consultations_wpp_confirm
  ON consultations (clinic_id, scheduled_date)
  WHERE wpp_confirmation_sent_at IS NULL
    AND scheduled_date IS NOT NULL
    AND status NOT IN ('completed','cancelled');
