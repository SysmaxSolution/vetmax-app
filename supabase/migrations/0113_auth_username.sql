-- =============================================================================
-- VetMax — Migration 0113: Username no perfil + campos extras em pending_registrations
-- G-08 Auth Enhancement
-- =============================================================================

-- 1. Adiciona username único ao perfil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (username)
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.profiles.username IS 'Nome de usuário único no sistema (ex: @drcarlos)';

-- 2. Torna clinic_name opcional (para usuarios que aderem a clínica existente)
ALTER TABLE public.pending_registrations
  ALTER COLUMN clinic_name DROP NOT NULL;

-- 3. Campos extras para G-08
ALTER TABLE public.pending_registrations
  ADD COLUMN IF NOT EXISTS username  text,
  ADD COLUMN IF NOT EXISTS phone     text,
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cnpj      text;

COMMENT ON COLUMN public.pending_registrations.clinic_id IS 'Se preenchido, usuário está aderindo a uma clínica existente';
COMMENT ON COLUMN public.pending_registrations.cnpj      IS 'CNPJ para criação de nova clínica (sem formatação, 14 dígitos)';
