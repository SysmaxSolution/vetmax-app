-- ─── 0178: amplia a constraint de ação em user_permissions_granular ──────────
-- O catálogo de Direitos de Acesso (src/config/access-catalog.ts) usa ações
-- além de view/create/edit/delete: export (relatórios, fluxo de caixa) e
-- approve (aprovação de contas a pagar, descontos, alta clínica etc.).
-- A constraint antiga rejeitava esses valores e quebrava o modal.

ALTER TABLE public.user_permissions_granular
  DROP CONSTRAINT IF EXISTS user_permissions_granular_action_check;

ALTER TABLE public.user_permissions_granular
  ADD CONSTRAINT user_permissions_granular_action_check
  CHECK (action IN ('view', 'create', 'edit', 'delete', 'export', 'approve'));
