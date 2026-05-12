-- 0107: Modo Foco Clínico — surgery toggle no perfil + log de escaladas de urgência

-- ── profiles: flag de cirurgia ──────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_in_surgery boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_in_surgery IS 'Veterinário em cirurgia — ativa o Modo Foco Clínico';

-- ── urgency_escalation_logs ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS urgency_escalation_logs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_id uuid        REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  tutor_phone     text        NOT NULL,
  tutor_name      text,
  urgency_level   text        NOT NULL CHECK (urgency_level IN ('high', 'critical')),
  message_snippet text,
  vet_user_id     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  notified_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_urgency_escalation_clinic
  ON urgency_escalation_logs (clinic_id, notified_at DESC);

CREATE INDEX IF NOT EXISTS idx_urgency_escalation_unresolved
  ON urgency_escalation_logs (clinic_id)
  WHERE resolved_at IS NULL;

-- Necessário para Supabase Realtime filtrar por clinic_id em INSERTs
ALTER TABLE urgency_escalation_logs REPLICA IDENTITY FULL;

ALTER TABLE urgency_escalation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "urgency_logs_clinic_isolation" ON urgency_escalation_logs
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- Adiciona à publicação Realtime para o hook useRealtimeSync funcionar
ALTER PUBLICATION supabase_realtime ADD TABLE urgency_escalation_logs;
