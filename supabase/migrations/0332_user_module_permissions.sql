-- =============================================================================
-- VetMax — Migration 0105: Permissões de Módulos por Usuário (RBAC)
-- Tabela canônica para controle granular de acesso a módulos por usuário.
-- Testes E2E e o dashboard layout leem/escrevem nessa tabela.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_module_permissions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module     text        NOT NULL,
  allowed    boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user
  ON user_module_permissions(user_id, clinic_id);

-- RLS: usuário autenticado só vê registros da própria clínica
ALTER TABLE user_module_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_user_module_permissions" ON user_module_permissions;
CREATE POLICY "clinic_isolation_user_module_permissions"
  ON user_module_permissions FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());

-- Admin pode ler/escrever todos os registros da clínica (necessário para service_role)
DROP POLICY IF EXISTS "service_role_user_module_permissions" ON user_module_permissions;
CREATE POLICY "service_role_user_module_permissions"
  ON user_module_permissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ROLLBACK:
-- DROP TABLE IF EXISTS user_module_permissions;
