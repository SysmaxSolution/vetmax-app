-- =============================================================================
-- VetMax — Migration 0077: Cadastro de Salas/Boxes
-- Permite que cada clínica cadastre suas salas de atendimento.
-- =============================================================================

CREATE TABLE IF NOT EXISTS rooms (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  type       text        NOT NULL DEFAULT 'consultation',
  capacity   integer     NOT NULL DEFAULT 1,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rooms_clinic ON rooms(clinic_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_rooms_updated_at ON rooms;
CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_rooms" ON rooms;
CREATE POLICY "clinic_isolation_rooms"
  ON rooms FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ROLLBACK:
-- DROP TABLE IF EXISTS rooms;
