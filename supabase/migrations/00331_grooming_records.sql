-- =============================================================================
-- VetMax — Migration 0033: grooming_records
-- Módulo Banho e Tosa — Registros/evoluções por sessão (com voz)
-- =============================================================================

CREATE TABLE IF NOT EXISTS grooming_records (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid          NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  clinic_id           uuid          NOT NULL REFERENCES clinics(id)            ON DELETE CASCADE,
  voice_transcription text,
  services_applied    jsonb         NOT NULL DEFAULT '[]',
  products_used       jsonb         NOT NULL DEFAULT '[]',
  behavior            text          CHECK (behavior IN ('tranquilo','agitado','agressivo','ansioso')),
  observations        text,
  user_name           text          NOT NULL,
  created_by          uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_grooming_records_session_id ON grooming_records(session_id);
CREATE INDEX IF NOT EXISTS idx_grooming_records_clinic_id  ON grooming_records(clinic_id);

-- RLS
ALTER TABLE grooming_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_grooming_records" ON grooming_records;
CREATE POLICY "clinic_isolation_grooming_records"
  ON grooming_records FOR ALL TO authenticated
  USING  (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
