-- =============================================================================
-- VetMax — Migration 0106: Corrige user_module_permissions para PK composta
-- O Supabase JS upsert() sem onConflict usa o PK da tabela para detecção de
-- conflito. Com id UUID como PK, chamadas sem id geram novo UUID e falham
-- na UNIQUE constraint (clinic_id, user_id, module) silenciosamente.
-- Solução: tornar (clinic_id, user_id, module) o PRIMARY KEY.
-- =============================================================================

DROP TABLE IF EXISTS user_module_permissions;

CREATE TABLE user_module_permissions (
  clinic_id  uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module     text        NOT NULL,
  allowed    boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user
  ON user_module_permissions(user_id, clinic_id);

ALTER TABLE user_module_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_user_module_permissions" ON user_module_permissions;
CREATE POLICY "clinic_isolation_user_module_permissions"
  ON user_module_permissions FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

DROP POLICY IF EXISTS "service_role_user_module_permissions" ON user_module_permissions;
CREATE POLICY "service_role_user_module_permissions"
  ON user_module_permissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);
