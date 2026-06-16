-- 0389: Respostas rápidas (quick replies) — Feature 2
CREATE TABLE IF NOT EXISTS whatsapp_quick_replies (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  category   text,
  title      text        NOT NULL,
  body       text        NOT NULL,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpp_qr_clinic
  ON whatsapp_quick_replies (clinic_id, sort_order, category);

ALTER TABLE whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY wpp_qr_clinic_isolation ON whatsapp_quick_replies
  FOR ALL USING (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());
