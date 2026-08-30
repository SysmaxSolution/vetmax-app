-- 0423: Clínicas Parceiras + campos da OS (Sprint Animais, Fase 0, peças 4 e 5).
-- (a) partner_clinics: cadastro de clínicas que ENCAMINHAM pacientes (B2B),
--     com tabela de preço vinculada e config de comissão/coparticipação.
-- (b) consultations (a OS): nº legível, urgência (verde/amarelo/vermelho),
--     origem (direto/encaminhado) + clínica parceira, empresa faturante.
-- (c) consultation_services: empresa faturante do serviço (multi-CNPJ).
-- Aditiva. RLS sem policy pública (service role).

-- ─── (a) CLÍNICAS PARCEIRAS (rotina CADASTROS, igual fornecedores) ──────────
CREATE TABLE IF NOT EXISTS partner_clinics (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id          UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  legal_name         TEXT,
  cnpj               TEXT,
  crmv               TEXT,                         -- registro do MV responsável, se houver
  contact_name       TEXT,
  phone              TEXT,
  email              TEXT,
  address            TEXT,
  price_table_id     UUID        REFERENCES price_tables(id) ON DELETE SET NULL, -- tabela de preço desta parceira
  commission_enabled BOOLEAN     NOT NULL DEFAULT FALSE,  -- comissionamento OPCIONAL (o Dr. decide)
  commission_percent NUMERIC(6,3),                        -- % de comissão/coparticipação por serviço encaminhado
  notes              TEXT,
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partner_clinics_clinic ON partner_clinics (clinic_id) WHERE is_active;
ALTER TABLE partner_clinics ENABLE ROW LEVEL SECURITY;

-- ─── (b) CAMPOS DA OS (consultations) ──────────────────────────────────────
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS os_number         TEXT;    -- nº de atendimento legível (via next_document_number)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS urgency           TEXT
  CHECK (urgency IN ('green','yellow','red'));                                  -- verde=comum, amarelo=risco, vermelho=emergência
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS referral_type     TEXT
  CHECK (referral_type IN ('direct','referred'));                              -- B2C direto x B2B encaminhado
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS partner_clinic_id UUID REFERENCES partner_clinics(id) ON DELETE SET NULL;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS billing_company_id UUID REFERENCES companies(id) ON DELETE SET NULL; -- empresa "âncora" da OS
CREATE INDEX IF NOT EXISTS idx_consultations_partner ON consultations (partner_clinic_id) WHERE partner_clinic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consultations_os_number ON consultations (clinic_id, os_number);

-- ─── (c) EMPRESA FATURANTE POR SERVIÇO (multi-CNPJ na mesma visita) ─────────
ALTER TABLE consultation_services ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_consultation_services_company ON consultation_services (company_id) WHERE company_id IS NOT NULL;
