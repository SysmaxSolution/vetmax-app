-- ============================================================
-- 0026_whatsapp_notifications
-- Tabela de log de notificações WhatsApp enviadas aos tutores
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_notifications (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id        uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  consultation_id  uuid REFERENCES consultations(id) ON DELETE SET NULL,
  hospitalization_id uuid REFERENCES hospitalizations(id) ON DELETE SET NULL,
  tutor_phone      text NOT NULL,
  tutor_name       text,
  trigger_type     text NOT NULL
    CHECK (trigger_type IN (
      'triage_called',
      'triage_completed',
      'documents_sent',
      'exam_completed',
      'hospitalization_update',
      'hospitalization_discharge'
    )),
  message          text NOT NULL,
  sent_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  sent_at          timestamptz DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE whatsapp_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_clinic_isolation" ON whatsapp_notifications
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- Index para consultas por clínica
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_clinic
  ON whatsapp_notifications (clinic_id, sent_at DESC);
