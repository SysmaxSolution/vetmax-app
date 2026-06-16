-- 0386: contador de não-lidos e pin para conversas WhatsApp
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS unread_count integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pinned_at    timestamptz,
  ADD COLUMN IF NOT EXISTS pin_order    integer;

-- Incremento atômico para o webhook (evita race-condition)
CREATE OR REPLACE FUNCTION fn_wpp_increment_unread(p_conv_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE whatsapp_conversations
    SET unread_count = unread_count + 1
  WHERE id = p_conv_id;
$$;

CREATE INDEX IF NOT EXISTS idx_wpp_conv_unread
  ON whatsapp_conversations (clinic_id, unread_count)
  WHERE unread_count > 0;

CREATE INDEX IF NOT EXISTS idx_wpp_conv_pinned
  ON whatsapp_conversations (clinic_id, pin_order NULLS LAST)
  WHERE pinned_at IS NOT NULL;
