-- ─── 0179: convite carrega lista de módulos a liberar para o novo usuário ──
-- Permite ao admin configurar os acessos ANTES de gerar o link de convite.
-- Quando o usuário aceita o convite e completa o onboarding, o sistema cria
-- as rows correspondentes em user_module_access automaticamente.

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS module_access JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.invitations.module_access IS
  'Array de objetos { module_name: string, enabled: boolean } definidos pelo admin antes de gerar o link. Aplicados no completeOnboarding.';
