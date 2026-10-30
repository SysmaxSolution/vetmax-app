-- 0531 — Grupos de acesso (Diretoria, Recepção, Veterinários, Caixa…).
--
-- Hoje cada pessoa é configurada do zero: quem contrata uma recepcionista
-- marca à mão os mesmos módulos e os mesmos direitos que marcou para a
-- recepcionista anterior. O pedido da Clínica Animais (30/10/2026) é ter
-- grupos, criados pela própria clínica, com o que cada um acessa por padrão.
--
-- O grupo é um MOLDE, não uma corrente: ao colocar a pessoa no grupo, os
-- acessos do grupo são aplicados ao cadastro dela, e dali em diante podem ser
-- ajustados individualmente sem afetar o grupo nem as outras pessoas. É o que
-- o pedido descreve ("já são pré-carregados do grupo e poderão ser removidos
-- ou adicionados novos direitos para o usuário específico").
--
-- Aditiva e idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS access_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  /** Módulos visíveis: ["reception","patients",...] — espelha user_module_access. */
  modules     JSONB NOT NULL DEFAULT '[]'::jsonb,
  /** Direitos detalhados: [{"module":"cashier.reports","action":"view","allowed":false}] */
  rights      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_access_groups_nome
  ON access_groups (clinic_id, lower(btrim(name)));

COMMENT ON TABLE access_groups IS
  'Molde de acessos por função (Recepção, Veterinários, Caixa…). Aplicar a um usuário copia os acessos; não cria dependência.';

-- De qual grupo a pessoa veio. Serve para a tela mostrar "Recepção" ao lado do
-- nome e para reaplicar o molde quando o grupo mudar — nunca para recalcular
-- permissão em tempo de execução, que continua lendo user_module_access e
-- user_permissions_granular.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_group_id UUID REFERENCES access_groups(id) ON DELETE SET NULL;
COMMENT ON COLUMN profiles.access_group_id IS
  'Grupo de acesso aplicado por último a este usuário. Rótulo e ponto de partida, não fonte de verdade da permissão.';

CREATE INDEX IF NOT EXISTS idx_profiles_access_group
  ON profiles (access_group_id) WHERE access_group_id IS NOT NULL;

ALTER TABLE access_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_groups_admin_all ON access_groups;
CREATE POLICY access_groups_admin_all ON access_groups
  FOR ALL
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS access_groups_read ON access_groups;
CREATE POLICY access_groups_read ON access_groups
  FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMIT;
