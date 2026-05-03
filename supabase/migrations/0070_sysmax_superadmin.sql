-- =============================================================================
-- VetMax — Migration 0070: Acesso Interno SysMax (Superadmin)
-- Usuário invisível para o proprietário, com acesso admin a qualquer clínica.
-- A invisibilidade é tratada no application-level (filtro is_sysmax no código).
-- =============================================================================

-- 1. Flag para identificar o superadmin SysMax
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_sysmax BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Comentário explicativo
COMMENT ON COLUMN public.profiles.is_sysmax IS
  'TRUE = conta interna SysMax Solutions (suporte). Filtrada no application-level.';
