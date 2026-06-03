-- ─── Feature Toggle: versão de layout por clínica ────────────────────────────
--
-- Adiciona o campo layout_version à tabela clinics para controlar qual interface
-- o sistema renderiza para cada clínica. O valor padrão 'classic' garante que
-- todas as clínicas existentes e novas fiquem no layout atual sem intervenção.
--
-- Valores válidos:
--   'classic' — layout atual do sistema (padrão)
--   'modern'  — novo layout (disponível para ativação pelo SysMax)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS layout_version TEXT NOT NULL DEFAULT 'classic';

ALTER TABLE public.clinics
  DROP CONSTRAINT IF EXISTS clinics_layout_version_check;

ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_layout_version_check
  CHECK (layout_version IN ('classic', 'modern'));

COMMENT ON COLUMN public.clinics.layout_version IS
  'Versão do layout da interface: classic (padrão) ou modern. Configurável apenas pelo usuário SysMax.';
