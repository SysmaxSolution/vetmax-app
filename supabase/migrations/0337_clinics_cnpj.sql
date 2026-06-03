-- =============================================================================
-- VetMax — Migration 0114: CNPJ e dados fiscais nas clínicas
-- G-08 Auth Enhancement — auto-fill via publica.cnpj.ws
-- =============================================================================

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS cnpj      text,
  ADD COLUMN IF NOT EXISTS cnpj_data jsonb,
  ADD COLUMN IF NOT EXISTS phone     text;

-- CNPJ único por clínica (apenas quando preenchido)
CREATE UNIQUE INDEX IF NOT EXISTS clinics_cnpj_unique
  ON public.clinics (cnpj)
  WHERE cnpj IS NOT NULL;

COMMENT ON COLUMN public.clinics.cnpj      IS 'CNPJ sem formatação (14 dígitos)';
COMMENT ON COLUMN public.clinics.cnpj_data IS 'Dados completos retornados pela API publica.cnpj.ws';
COMMENT ON COLUMN public.clinics.phone     IS 'Telefone principal da clínica';
