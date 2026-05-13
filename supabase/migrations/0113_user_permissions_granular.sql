-- G-14: Permissões granulares por usuário (módulo × ação)
-- Criamos nova tabela para não quebrar user_module_access existente

CREATE TABLE IF NOT EXISTS user_permissions_granular (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id    UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module     VARCHAR(60)  NOT NULL,
  action     VARCHAR(20)  NOT NULL DEFAULT 'view'
                          CHECK (action IN ('view', 'create', 'edit', 'delete')),
  allowed    BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_permissions_granular UNIQUE (clinic_id, user_id, module, action)
);

CREATE INDEX IF NOT EXISTS idx_upg_clinic_user
  ON user_permissions_granular (clinic_id, user_id);

CREATE INDEX IF NOT EXISTS idx_upg_module_action
  ON user_permissions_granular (clinic_id, user_id, module, action);

-- RLS
ALTER TABLE user_permissions_granular ENABLE ROW LEVEL SECURITY;

-- Admin da clínica pode ver e editar tudo
CREATE POLICY "upg_admin_all" ON user_permissions_granular
  FOR ALL
  USING (
    clinic_id = (
      SELECT clinic_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
      LIMIT 1
    )
  )
  WITH CHECK (
    clinic_id = (
      SELECT clinic_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
      LIMIT 1
    )
  );

-- Qualquer usuário autenticado pode ler suas próprias permissões
CREATE POLICY "upg_self_read" ON user_permissions_granular
  FOR SELECT
  USING (user_id = auth.uid());
