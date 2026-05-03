-- Migration: adiciona trigger_type 'consultation_finished' à tabela whatsapp_notifications

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'whatsapp_notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%trigger_type%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE whatsapp_notifications DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE whatsapp_notifications
  ADD CONSTRAINT whatsapp_notifications_trigger_type_check
  CHECK (trigger_type IN (
    'triage_called',
    'triage_completed',
    'documents_sent',
    'exam_completed',
    'hospitalization_update',
    'hospitalization_discharge',
    'consultation_finished'
  ));
