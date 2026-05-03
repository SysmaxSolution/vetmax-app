-- =============================================================================
-- VetMax — Migration 0069: Tabela user_clinics (Multi-Clínica)
-- Permite que um usuário esteja vinculado a múltiplas clínicas.
-- profiles.clinic_id continua sendo a "clínica ativa" (usada pelo RLS).
-- user_clinics armazena todos os vínculos possíveis.
-- =============================================================================

-- 1. Tabela de vínculo usuário <-> clínica
CREATE TABLE IF NOT EXISTS public.user_clinics (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id  UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin','vet','assistant','receptionist','pharmacist')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, clinic_id)
);

-- Índices para lookups rápidos
CREATE INDEX IF NOT EXISTS idx_user_clinics_user   ON public.user_clinics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_clinics_clinic ON public.user_clinics(clinic_id);

-- 2. Migrar vínculos existentes de profiles para user_clinics
-- Cada profile com clinic_id vira um registro em user_clinics
INSERT INTO public.user_clinics (user_id, clinic_id, role)
SELECT id, clinic_id, role
FROM public.profiles
WHERE clinic_id IS NOT NULL
ON CONFLICT (user_id, clinic_id) DO NOTHING;

-- 3. RLS: usuário só vê seus próprios vínculos
ALTER TABLE public.user_clinics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_clinics_select_own"
  ON public.user_clinics FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Inserts e deletes apenas via service_role (admin client)
-- Não criar policies para INSERT/UPDATE/DELETE — bloqueado por padrão

-- 4. Função RPC para trocar de clínica ativa
-- Valida que o usuário tem vínculo antes de trocar
CREATE OR REPLACE FUNCTION public.switch_clinic(target_clinic_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _link RECORD;
BEGIN
  -- Verifica vínculo
  SELECT role INTO _link
  FROM public.user_clinics
  WHERE user_id = _uid AND clinic_id = target_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não tem vínculo com esta clínica';
  END IF;

  -- Atualiza clínica ativa e role no profile
  UPDATE public.profiles
  SET clinic_id = target_clinic_id,
      role      = _link.role
  WHERE id = _uid;
END;
$$;

-- Revogar acesso direto à função para anon
REVOKE EXECUTE ON FUNCTION public.switch_clinic(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.switch_clinic(UUID) TO authenticated;
