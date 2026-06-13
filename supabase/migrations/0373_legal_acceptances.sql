-- Tabela de evidência legal de aceites de termos (LGPD Art. 7º + clickwrap).
-- Registro imutável: INSERT via service_role apenas (server actions).
-- RLS habilitada mas sem políticas para anon/authenticated → acesso apenas pelo
-- service_role (admin client) nas server actions.

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  document_type     text        NOT NULL,
  document_version  text        NOT NULL,
  document_hash     text        NOT NULL DEFAULT 'v1.0.0-pending',
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  ip_address        inet,
  user_agent        text,
  acceptance_method text        NOT NULL DEFAULT 'clickwrap_checkbox',
  document_url      text,
  CONSTRAINT legal_acceptances_doc_type_check
    CHECK (document_type IN ('terms_privacy_dpa', 'subscription_terms', 'enterprise_contract'))
);

-- Índices para auditoria
CREATE INDEX IF NOT EXISTS legal_acceptances_clinic_id_idx  ON public.legal_acceptances (clinic_id);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_id_idx    ON public.legal_acceptances (user_id);
CREATE INDEX IF NOT EXISTS legal_acceptances_accepted_at_idx ON public.legal_acceptances (accepted_at DESC);

-- RLS habilitada — sem políticas para anon/authenticated → apenas service_role
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_acceptances FROM anon, authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;

COMMENT ON TABLE public.legal_acceptances IS
  'Evidência legal imutável dos aceites de termos. '
  'Controlador=Clínica, Operador=Sysmax. Base: LGPD Art. 7º + CFMV Res. 1321/2020.';
