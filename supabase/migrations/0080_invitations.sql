-- =============================================================================
-- VetMax — Migration 0080: Tabela de Convites
-- Armazena convites enviados por administradores para novos membros da clínica.
-- =============================================================================

CREATE TABLE IF NOT EXISTS invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('vet','assistant','receptionist','pharmacist')),
  token       uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  invited_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_clinic ON invitations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token  ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email  ON invitations(email);

-- RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_invitations" ON invitations;
CREATE POLICY "clinic_isolation_invitations"
  ON invitations FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ROLLBACK:
-- DROP TABLE IF EXISTS invitations;
