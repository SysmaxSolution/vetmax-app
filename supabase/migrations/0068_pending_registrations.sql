-- Tabela temporária para preservar dados do cadastro entre o signUp e a confirmação de e-mail.
-- O Supabase sobrescreve user_metadata após email confirmation, então guardamos aqui.

CREATE TABLE IF NOT EXISTS public.pending_registrations (
  email       TEXT PRIMARY KEY,
  full_name   TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Limpeza automática de registros com mais de 7 dias (não confirmados)
CREATE OR REPLACE FUNCTION public.cleanup_pending_registrations()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.pending_registrations WHERE created_at < NOW() - INTERVAL '7 days';
$$;

-- Sem RLS — acesso apenas via service role (admin client)
ALTER TABLE public.pending_registrations DISABLE ROW LEVEL SECURITY;

-- Revogar acesso público (anon/authenticated não podem ler)
REVOKE ALL ON public.pending_registrations FROM anon, authenticated;
GRANT ALL ON public.pending_registrations TO service_role;
