-- 0527 — Agenda por setor e recurso (estudo de 29/10/2026, pedido da Animais).
-- Sala/aparelho vira coluna da agenda (rooms.schedulable), profissional e
-- recurso ganham setor, e nasce o cadastro de tipos de atendimento (duração,
-- recurso padrão, serviço). A marcação pode ter profissional, recurso ou os
-- dois. Nada muda para quem não cadastra recurso nem tipo. Aditiva, idempotente.

BEGIN;

-- ── Salas/aparelhos como recursos de agenda ─────────────────────────────────
ALTER TABLE rooms
  /** Aparece como coluna da agenda (ex.: Tomografia e RM, Raio X, Sala de Cirurgia). */
  ADD COLUMN IF NOT EXISTS schedulable BOOLEAN NOT NULL DEFAULT FALSE,
  /** Setor da agenda (Imagem, Cirurgia, Clínica, Laboratório…). */
  ADD COLUMN IF NOT EXISTS sector      TEXT,
  /** Cor da coluna/eventos do recurso. */
  ADD COLUMN IF NOT EXISTS color       TEXT;

-- ── Setor do profissional ───────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sector TEXT;

-- ── Tipos de atendimento ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_types (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name                  TEXT        NOT NULL,
  sector                TEXT,
  duration_minutes      INTEGER     NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 1440),
  color                 TEXT,
  /** Exige escolher o profissional (ex.: Tomografia com anestesia). */
  requires_professional BOOLEAN     NOT NULL DEFAULT FALSE,
  /** Recurso que este tipo ocupa por padrão (aparelho/sala). */
  default_room_id       UUID        REFERENCES rooms(id)       ON DELETE SET NULL,
  /** Serviço do catálogo que o tipo representa (preço/OS). */
  service_item_id       UUID        REFERENCES stock_items(id) ON DELETE SET NULL,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name)
);
CREATE INDEX IF NOT EXISTS idx_appointment_types_clinic ON appointment_types (clinic_id) WHERE is_active;
ALTER TABLE appointment_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_appointment_types" ON appointment_types;
CREATE POLICY "clinic_isolation_appointment_types"
  ON appointment_types FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ── Marcação: recurso e tipo ────────────────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS room_id             UUID REFERENCES rooms(id)             ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_type_id UUID REFERENCES appointment_types(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_room_datetime
  ON appointments (clinic_id, room_id, appointment_datetime) WHERE room_id IS NOT NULL;

COMMENT ON COLUMN rooms.schedulable IS 'Sala/aparelho aparece como coluna (recurso) da agenda; marcações ocupam o recurso e recusam conflito.';
COMMENT ON COLUMN appointments.room_id IS 'Recurso (sala/aparelho) ocupado pela marcação; pode existir com ou sem profissional.';

COMMIT;
