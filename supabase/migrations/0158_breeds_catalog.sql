-- =============================================================================
-- VetMax — Migration 0158: Cadastro Universal de Raças (Dual-Scope)
-- Tabela "breeds" para autocomplete de raças por espécie.
--   • clinic_id IS NULL → raça GLOBAL (curada pela Sysmax, visível a todas)
--   • clinic_id = X     → raça customizada da clínica X
-- patients.breed permanece TEXT livre — esta tabela é apenas fonte de sugestões.
-- =============================================================================

-- 1. Extensão unaccent para normalização (idempotente)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Wrapper IMMUTABLE para uso em colunas geradas / índices funcionais
--    (a função "unaccent" pública é STABLE, não pode ir direto em GENERATED)
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

-- 3. Tabela principal
CREATE TABLE IF NOT EXISTS public.breeds (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  species    TEXT        NOT NULL CHECK (species IN (
                'dog', 'cat', 'bird', 'rabbit',
                'rodent', 'reptile', 'fish', 'exotic'
             )),
  name       TEXT        NOT NULL,
  name_norm  TEXT        GENERATED ALWAYS AS (lower(public.f_unaccent(name))) STORED,
  clinic_id  UUID        REFERENCES public.clinics(id) ON DELETE CASCADE,
  created_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_global  BOOLEAN     GENERATED ALWAYS AS (clinic_id IS NULL) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Unicidade por escopo (global e por clínica não colidem entre si)
--    UNIQUE com NULL: em Postgres, NULLs são distintos → precisamos de dois índices.
CREATE UNIQUE INDEX IF NOT EXISTS uq_breeds_global_species_norm
  ON public.breeds (species, name_norm)
  WHERE clinic_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_breeds_clinic_species_norm
  ON public.breeds (clinic_id, species, name_norm)
  WHERE clinic_id IS NOT NULL;

-- 5. Índices de busca (autocomplete por prefixo/contains usa name_norm)
CREATE INDEX IF NOT EXISTS idx_breeds_species_norm ON public.breeds (species, name_norm);
CREATE INDEX IF NOT EXISTS idx_breeds_clinic       ON public.breeds (clinic_id);

-- 6. RLS
ALTER TABLE public.breeds ENABLE ROW LEVEL SECURITY;

-- SELECT: cada usuário vê o catálogo global + as raças da própria clínica
DROP POLICY IF EXISTS "breeds_select_global_or_own" ON public.breeds;
CREATE POLICY "breeds_select_global_or_own" ON public.breeds
  FOR SELECT TO authenticated
  USING (
    clinic_id IS NULL
    OR clinic_id = public.get_user_clinic_id()
  );

-- INSERT: apenas raças da própria clínica. Globais são populadas via service_role.
DROP POLICY IF EXISTS "breeds_insert_own_clinic" ON public.breeds;
CREATE POLICY "breeds_insert_own_clinic" ON public.breeds
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id IS NOT NULL
    AND clinic_id = public.get_user_clinic_id()
  );

-- UPDATE / DELETE: apenas dentro da própria clínica (globais ficam imutáveis para tenants)
DROP POLICY IF EXISTS "breeds_update_own_clinic" ON public.breeds;
CREATE POLICY "breeds_update_own_clinic" ON public.breeds
  FOR UPDATE TO authenticated
  USING (clinic_id = public.get_user_clinic_id())
  WITH CHECK (clinic_id = public.get_user_clinic_id());

DROP POLICY IF EXISTS "breeds_delete_own_clinic" ON public.breeds;
CREATE POLICY "breeds_delete_own_clinic" ON public.breeds
  FOR DELETE TO authenticated
  USING (clinic_id = public.get_user_clinic_id());

-- service_role full access (seeds, backfill, curadoria manual Sysmax)
DROP POLICY IF EXISTS "breeds_service_all" ON public.breeds;
CREATE POLICY "breeds_service_all" ON public.breeds
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.breeds       IS 'Catálogo dual-scope de raças por espécie. clinic_id NULL = global (Sysmax).';
COMMENT ON COLUMN public.breeds.name_norm IS 'lower(unaccent(name)) para busca case/accent-insensitive.';
