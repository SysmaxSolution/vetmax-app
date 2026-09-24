-- 0421: Fundação da Sprint Animais (Fase 0, peça 1) — multi-CNPJ + numeração.
-- (a) companies: "empresas faturantes" (CNPJs) dentro de um mesmo tenant/clínica.
--     Grupo Animais = 1 clinic_id; 3 empresas (Emp 001/002/003). Mesmo acesso,
--     UMA OS por visita, faturamento separado por empresa no recebimento.
-- (b) document_number_sequences: numeração configurável por tipo de documento
--     e por empresa (nº de OS, RPS, NFS-e...). Número inicial + série editáveis.
-- Aditiva (IF NOT EXISTS). Acesso só via service role — RLS sem policy pública.
-- Feature flag por clínica: clinics.flow_config->>'multi_company' = true.

-- ─── (a) EMPRESAS FATURANTES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id                     UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id              UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  code                   TEXT        NOT NULL,              -- "001", "002", "003"
  name                   TEXT        NOT NULL,              -- nome curto (Emp 001)
  legal_name             TEXT,                              -- razão social completa
  cnpj                   TEXT,
  municipal_registration TEXT,                              -- inscrição municipal (NFS-e)
  is_default             BOOLEAN     NOT NULL DEFAULT FALSE,-- empresa padrão do grupo
  is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
  fiscal_config          JSONB       NOT NULL DEFAULT '{}'::jsonb, -- série RPS, regime, etc.
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, code)
);
CREATE INDEX IF NOT EXISTS idx_companies_clinic ON companies (clinic_id) WHERE is_active;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
-- Sem policy: acesso só via service role (server action). Sem acesso anônimo.

-- ─── (b) NUMERAÇÃO CONFIGURÁVEL ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_number_sequences (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id    UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  company_id   UUID        REFERENCES companies(id) ON DELETE CASCADE, -- NULL = geral do grupo
  doc_type     TEXT        NOT NULL,                        -- 'os' | 'rps' | 'nfse' | ...
  prefix       TEXT        NOT NULL DEFAULT '',
  next_number  BIGINT      NOT NULL DEFAULT 1,              -- próximo número a emitir (configurável)
  padding      INT         NOT NULL DEFAULT 0,              -- zero-fill (ex.: 6 -> 000123)
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Unicidade tratando NULL de company_id como "geral" (coalesce p/ índice único).
CREATE UNIQUE INDEX IF NOT EXISTS uq_docseq_clinic_company_type
  ON document_number_sequences (clinic_id, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), doc_type);

ALTER TABLE document_number_sequences ENABLE ROW LEVEL SECURITY;
-- Sem policy: acesso só via service role.

-- Função ATÔMICA para obter o próximo número (evita corrida em concorrência).
-- Retorna o número já formatado com prefixo + zero-fill; incrementa a série.
CREATE OR REPLACE FUNCTION next_document_number(
  p_clinic_id UUID,
  p_company_id UUID,
  p_doc_type  TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num    BIGINT;
  v_prefix TEXT;
  v_pad    INT;
BEGIN
  UPDATE document_number_sequences
     SET next_number = next_number + 1,
         updated_at  = NOW()
   WHERE clinic_id = p_clinic_id
     AND doc_type  = p_doc_type
     AND COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(p_company_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND is_active
   RETURNING next_number - 1, prefix, padding INTO v_num, v_prefix, v_pad;

  IF v_num IS NULL THEN
    RAISE EXCEPTION 'Sequência de numeração não configurada (clinic=%, company=%, doc_type=%)',
      p_clinic_id, p_company_id, p_doc_type;
  END IF;

  RETURN v_prefix || LPAD(v_num::TEXT, GREATEST(v_pad, LENGTH(v_num::TEXT)), '0');
END;
$$;
