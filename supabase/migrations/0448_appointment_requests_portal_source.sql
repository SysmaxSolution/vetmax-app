-- 0448 — Agendamento pelo Portal do Tutor (Fase 3).
--
-- appointment_requests nasceu para o M9-bot (WhatsApp): conversation_id é NOT NULL
-- e FK para whatsapp_conversations. Uma solicitação vinda do PORTAL (web) não tem
-- conversa de WhatsApp → tornamos conversation_id nullable e rastreamos a ORIGEM
-- com a coluna `source`. Aditiva + idempotente.

BEGIN;

ALTER TABLE appointment_requests ALTER COLUMN conversation_id DROP NOT NULL;

ALTER TABLE appointment_requests
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'whatsapp';  -- 'whatsapp' | 'portal' | 'reception'

CREATE INDEX IF NOT EXISTS idx_appointment_requests_source ON appointment_requests (clinic_id, source);

COMMIT;
