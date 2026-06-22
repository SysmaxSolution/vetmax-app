-- M9: Solicitações de agendamento via WhatsApp — validação obrigatória pela recepção
CREATE TABLE IF NOT EXISTS appointment_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         UUID        NOT NULL REFERENCES clinics(id),
  conversation_id   UUID        NOT NULL REFERENCES whatsapp_conversations(id),
  tutor_id          UUID        NOT NULL,
  pet_id            UUID,
  preferred_date    DATE        NOT NULL,
  preferred_time    TIME        NOT NULL,
  preferred_date_alt DATE,
  preferred_time_alt TIME,
  status            TEXT        NOT NULL DEFAULT 'pending_reception_validation'
    CHECK (status IN ('pending_reception_validation','approved','proposed_alternative','rejected','expired')),
  validated_by_id   UUID,
  validated_at      TIMESTAMPTZ,
  validation_notes  TEXT,
  proposed_date     DATE,
  proposed_time     TIME,
  created_appointment_id UUID   REFERENCES appointments(id),
  visit_reason      TEXT,
  vet_id            UUID,
  pet_name_free     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 days'),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS appointment_requests_clinic_status ON appointment_requests(clinic_id, status);
CREATE INDEX IF NOT EXISTS appointment_requests_conversation  ON appointment_requests(conversation_id);
CREATE INDEX IF NOT EXISTS appointment_requests_expires       ON appointment_requests(expires_at) WHERE status = 'pending_reception_validation';

ALTER TABLE appointment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation" ON appointment_requests
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION update_appointment_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_appointment_requests_updated_at
  BEFORE UPDATE ON appointment_requests
  FOR EACH ROW EXECUTE FUNCTION update_appointment_requests_updated_at();
