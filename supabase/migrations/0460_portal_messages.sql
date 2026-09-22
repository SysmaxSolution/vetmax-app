-- 0460 — Chat tutor↔clínica pelo portal. Thread simples por tutor (opcionalmente
-- referente a um pet). Sem policy de RLS: acesso só via service role.

CREATE TABLE IF NOT EXISTS portal_messages (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id         UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  tutor_user_id     UUID        NOT NULL REFERENCES tutor_users(id) ON DELETE CASCADE,
  patient_id        UUID        REFERENCES patients(id) ON DELETE SET NULL,
  sender            TEXT        NOT NULL CHECK (sender IN ('tutor','clinic')),
  sender_profile_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,  -- quando 'clinic'
  body              TEXT        NOT NULL,
  read_at           TIMESTAMPTZ,   -- lido pela outra ponta
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_msg_clinic ON portal_messages (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_msg_tutor  ON portal_messages (tutor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_portal_msg_unread ON portal_messages (clinic_id, sender) WHERE read_at IS NULL;

ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;
-- Sem policy: acesso só via service role.
