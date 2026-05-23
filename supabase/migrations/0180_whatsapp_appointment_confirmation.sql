-- ============================================================
-- 0180_whatsapp_appointment_confirmation
-- Campanha de confirmação de agendamento via Bot WhatsApp
-- ============================================================

-- 1) Expande o CHECK de whatsapp_campaigns.trigger_type para incluir o novo gatilho
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM   pg_constraint
  WHERE  conrelid = 'public.whatsapp_campaigns'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) ILIKE '%trigger_type%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE whatsapp_campaigns DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE whatsapp_campaigns
    ADD CONSTRAINT whatsapp_campaigns_trigger_type_check
    CHECK (trigger_type IN (
      'no_visit',
      'vaccine_due',
      'pending_return',
      'grooming_due',
      'appointment_confirmation'
    ));
END$$;

-- 2) Colunas de rastreio em appointments — etiqueta + controle de reenvio
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS bot_confirmation_status   text
    CHECK (bot_confirmation_status IN ('confirmed','rescheduled','cancelled')),
  ADD COLUMN IF NOT EXISTS bot_confirmation_at       timestamptz,
  ADD COLUMN IF NOT EXISTS bot_confirmation_sent_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_appointments_bot_confirmation_sent
  ON appointments (clinic_id, bot_confirmation_sent_at)
  WHERE bot_confirmation_sent_at IS NULL AND status = 'scheduled';

-- 3) Vínculo de conversa ↔ agendamento pendente de confirmação
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS pending_appointment_id uuid
    REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wpp_conversations_pending_appt
  ON whatsapp_conversations (clinic_id, pending_appointment_id)
  WHERE pending_appointment_id IS NOT NULL;
