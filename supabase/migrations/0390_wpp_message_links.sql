-- 0390: Vinculação de mensagens WhatsApp ao prontuário — Feature 8
CREATE TABLE IF NOT EXISTS whatsapp_message_links (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_id uuid        NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  message_id      uuid        NOT NULL REFERENCES whatsapp_messages(id) ON DELETE CASCADE,
  consultation_id uuid        NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  note            text,
  created_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, consultation_id)
);

CREATE INDEX IF NOT EXISTS idx_wpp_mlinks_consultation
  ON whatsapp_message_links (consultation_id);

CREATE INDEX IF NOT EXISTS idx_wpp_mlinks_clinic
  ON whatsapp_message_links (clinic_id, created_at DESC);

ALTER TABLE whatsapp_message_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY wpp_mlinks_clinic_isolation ON whatsapp_message_links
  FOR ALL USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());
