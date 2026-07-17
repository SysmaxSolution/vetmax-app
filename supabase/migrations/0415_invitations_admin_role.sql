-- ════════════════════════════════════════════════════════════════════════════
-- 0415 — Convite de Administradores
--
-- Grupos multi-sócio (ex.: 3 CNPJs da mesma família) precisam convidar os
-- demais sócios como admin — o dono que cadastra a clínica não é o único
-- gestor. O fluxo de aceite (onboarding join mode) já propaga o role do
-- convite para profiles e user_clinics sem lógica específica por role.
-- Segurança preservada: apenas admins autenticados criam convites
-- (createInvitation valida profile.role === 'admin').
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_role_check;

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('admin', 'vet', 'assistant', 'receptionist', 'pharmacist'));

COMMENT ON CONSTRAINT invitations_role_check ON public.invitations IS
  'Roles convidáveis. admin incluído em 0415 (grupos multi-sócio).';
