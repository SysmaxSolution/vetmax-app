-- PLG Sprint 1 — Feature flags booleanos por tenant
-- Controla acesso a módulos premium. Gerenciado via service_role ao mudar de plano.
-- Plano Free: todos FALSE. Plano Pro/Enterprise: flags habilitados conforme contrato.

CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  clinic_id               UUID    PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  has_advanced_finance    BOOLEAN NOT NULL DEFAULT FALSE,
  has_smart_packages      BOOLEAN NOT NULL DEFAULT FALSE,
  has_tef_integration     BOOLEAN NOT NULL DEFAULT FALSE,
  has_document_templates  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenant_feature_flags IS
  'Feature flags booleanos por tenant. Colunas separadas para índice parcial eficiente.';
COMMENT ON COLUMN tenant_feature_flags.has_advanced_finance IS
  'Acesso ao módulo financeiro avançado (DRE, centro de custo, conciliação bancária).';
COMMENT ON COLUMN tenant_feature_flags.has_smart_packages IS
  'Acesso ao catálogo de pacotes de serviços com sessões (Smart Packages).';
COMMENT ON COLUMN tenant_feature_flags.has_tef_integration IS
  'Integração com terminal TEF/POS físico (Cielo, Stone, GetNet).';
COMMENT ON COLUMN tenant_feature_flags.has_document_templates IS
  'Editor de documentos Pixel Perfect (laudos, receitas, encaminhamentos).';

-- RLS: leitura apenas para membros da própria clínica
ALTER TABLE tenant_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_feature_flags_select_own"
  ON tenant_feature_flags FOR SELECT
  USING (
    clinic_id = (
      SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- Seed: provisiona flags (todos FALSE = Free) para clínicas existentes
INSERT INTO tenant_feature_flags (clinic_id)
  SELECT id FROM clinics
  ON CONFLICT (clinic_id) DO NOTHING;
