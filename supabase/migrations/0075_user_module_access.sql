-- =============================================================================
-- VetMax — Migration 0075: Acesso a Módulos por Usuário
-- Controle granular: admin define quais módulos cada usuário pode acessar.
-- Regra: módulo desativado na clínica = desativado para todos, independente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_module_access (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_name text       NOT NULL,
  enabled    boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, user_id, module_name)
);

CREATE INDEX IF NOT EXISTS idx_user_module_access_user
  ON user_module_access(user_id, clinic_id);

-- RLS
ALTER TABLE user_module_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_user_module_access" ON user_module_access;
CREATE POLICY "clinic_isolation_user_module_access"
  ON user_module_access FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- ROLLBACK:
-- DROP TABLE IF EXISTS user_module_access;
