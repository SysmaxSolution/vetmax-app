-- 0439 — NFS-e desmembrada por empresa faturante (Fase 1 · item 1.A).
-- Config fiscal POR EMPRESA (override da config por clínica) + vínculo da nota
-- à empresa. Aditiva + idempotente. Retrocompat: clínicas de 1 CNPJ continuam
-- usando clinic_fiscal_config (fallback no código).

-- 1) Config fiscal por empresa faturante (tokens/parâmetros tributários).
--    A IDENTIDADE do prestador (CNPJ, inscrição municipal, razão social) vem de
--    companies (cnpj, municipal_registration, legal_name) — não duplicar aqui.
CREATE TABLE IF NOT EXISTS company_fiscal_config (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                   uuid NOT NULL,
  company_id                  uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  emits_nfse                  boolean NOT NULL DEFAULT false,
  is_active                   boolean NOT NULL DEFAULT false,
  environment                 text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  provider                    text NOT NULL DEFAULT 'focus_nfe',
  focus_token_sandbox         text,
  focus_token_production      text,
  regime_tributario           text,
  optante_simples             boolean NOT NULL DEFAULT false,
  codigo_municipio            text,
  cnae                        text,
  item_lista_servico          text,
  codigo_tributario_municipio text,
  iss_aliquota                numeric(6,4),
  iss_retido                  boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_fiscal_config_clinic ON company_fiscal_config (clinic_id);

ALTER TABLE company_fiscal_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_fiscal_config' AND policyname = 'company_fiscal_config_tenant') THEN
    CREATE POLICY company_fiscal_config_tenant ON company_fiscal_config
      USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- 2) Vínculo da nota (billing_documents) à empresa faturante emitente.
ALTER TABLE billing_documents
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_billing_documents_company
  ON billing_documents (company_id) WHERE company_id IS NOT NULL;

-- 3) Emissão automática de NFS-e no checkout (por clínica; default off p/ retrocompat).
ALTER TABLE clinic_fiscal_config
  ADD COLUMN IF NOT EXISTS nfse_auto_checkout boolean NOT NULL DEFAULT false;
