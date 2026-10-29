-- 0393: WhatsApp — Mídia, Participantes, Check Azul, Tutor Linkado

-- ── Mensagens: ACK, mídia, identidade do remetente ────────────────────────────
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS evolution_message_id  text,
  ADD COLUMN IF NOT EXISTS ack                   int2    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_url             text,
  ADD COLUMN IF NOT EXISTS media_type            text,
  ADD COLUMN IF NOT EXISTS media_mime_type       text,
  ADD COLUMN IF NOT EXISTS media_filename        text,
  ADD COLUMN IF NOT EXISTS sender_profile_id     uuid    REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_name           text;

-- ── Conversas: link ao tutor e caches ─────────────────────────────────────────
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS tutor_id              uuid    REFERENCES tutors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pet_names_cache       text,
  ADD COLUMN IF NOT EXISTS tutor_photo_cache     text;

-- ── Participantes da conversa ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_conversation_participants (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES profiles(id)               ON DELETE CASCADE,
  clinic_id       uuid        NOT NULL,
  added_at        timestamptz NOT NULL DEFAULT now(),
  added_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(conversation_id, profile_id)
);
ALTER TABLE whatsapp_conversation_participants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "clinic_wpp_participants_all"
    ON whatsapp_conversation_participants FOR ALL
    USING  (clinic_id = get_user_clinic_id())
    WITH CHECK (clinic_id = get_user_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Storage: bucket para mídia do WhatsApp ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-media', 'whatsapp-media', true, 52428800)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "wpp_media_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'whatsapp-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "wpp_media_select"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'whatsapp-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Índices ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wpp_msg_evo_id
  ON whatsapp_messages(evolution_message_id)
  WHERE evolution_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wpp_conv_tutor
  ON whatsapp_conversations(tutor_id)
  WHERE tutor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wpp_participants_conv
  ON whatsapp_conversation_participants(conversation_id);
