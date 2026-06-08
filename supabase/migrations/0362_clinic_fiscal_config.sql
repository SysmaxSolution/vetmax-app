-- ════════════════════════════════════════════════════════════════════════════
-- 0362 — clinic_fiscal_config (Faturamento Fase 3 — NFS-e via Focus NFe)
-- ════════════════════════════════════════════════════════════════════════════
-- Configuração fiscal por clínica para emissão de NFS-e através do agregador
-- Focus NFe (provedor escolhido pelo PO em 08/06/2026). Uma linha por clínica.
--
-- O token e as credenciais ficam NESTA tabela (decisão do PO) — não em env vars
-- — para permitir multi-tenant com provedores/ambientes distintos por clínica.
-- RLS restringe leitura/escrita ao tenant; o token nunca sai via client (as
-- server actions usam o admin client e jamais retornam o token ao browser).
--
-- Aditiva e idempotente (IF NOT EXISTS), conforme regra de migrations do projeto.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinic_fiscal_config (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,

  -- Liga/desliga a emissão. Enquanto false, o gate de NFS-e fica dormente.
  emits_nfse         BOOLEAN NOT NULL DEFAULT FALSE,
  is_active          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Ambiente do provedor: 'sandbox' (homologação) | 'production'.
  environment        TEXT NOT NULL DEFAULT 'sandbox'
                     CHECK (environment IN ('sandbox', 'production')),
  provider           TEXT NOT NULL DEFAULT 'focus_nfe'
                     CHECK (provider IN ('focus_nfe')),

  -- Credenciais Focus NFe (token por ambiente). Preenchidas na UI Contábil.
  focus_token_sandbox    TEXT,
  focus_token_production TEXT,

  -- Identificação do prestador (emitente).
  cnpj               TEXT,
  inscricao_municipal TEXT,
  razao_social       TEXT,
  regime_tributario  TEXT,            -- ex.: 'simples_nacional' | 'mei' | 'normal'
  optante_simples    BOOLEAN NOT NULL DEFAULT TRUE,

  -- Parâmetros do serviço (município define os códigos/alíquotas).
  codigo_municipio   TEXT,            -- IBGE 7 dígitos
  cnae               TEXT,
  item_lista_servico TEXT,            -- código da lista LC 116
  codigo_tributario_municipio TEXT,
  iss_aliquota       NUMERIC(6,4),    -- ex.: 0.0200 = 2%
  iss_retido         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Numeração do RPS (Recibo Provisório de Serviços).
  rps_serie          TEXT DEFAULT '1',
  rps_proximo_numero INTEGER NOT NULL DEFAULT 1,
  rps_lote           INTEGER NOT NULL DEFAULT 1,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE clinic_fiscal_config IS
  'Config fiscal por clínica p/ emissão de NFS-e via Focus NFe (Faturamento Fase 3). Tokens ficam aqui (multi-tenant); nunca expostos ao client.';

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE clinic_fiscal_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_fiscal_config" ON clinic_fiscal_config;
CREATE POLICY "clinic_isolation_fiscal_config"
  ON clinic_fiscal_config FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ─── updated_at touch ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_clinic_fiscal_config_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clinic_fiscal_config_touch ON clinic_fiscal_config;
CREATE TRIGGER trg_clinic_fiscal_config_touch
  BEFORE UPDATE ON clinic_fiscal_config
  FOR EACH ROW EXECUTE FUNCTION fn_clinic_fiscal_config_touch();

-- ─── Vínculo NFS-e ↔ billing_documents ────────────────────────────────────────
-- Campos auxiliares no documento de faturamento para rastrear a emissão fiscal
-- (referência Focus NFe, número/verificação da nota, status do provedor).
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS nfse_ref           TEXT;
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS nfse_numero        TEXT;
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS nfse_codigo_verificacao TEXT;
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS nfse_provider_status TEXT;
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS nfse_url           TEXT;
