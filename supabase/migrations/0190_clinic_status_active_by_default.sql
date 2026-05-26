-- =============================================================================
-- VetMax — Migration 0190: clinics.status default → 'active' (Freemium PLG)
--
-- Contexto:
--  Migration 0033 setou clinics.status DEFAULT 'pending', exigindo aprovação
--  manual da Sysmax antes do primeiro login. Com o refator Freemium (commits
--  1-3 deste mesmo dia), o modelo passou a ser Product-Led: novo cliente
--  paga zero e entra direto no plano Free segmentado. A trava de pending
--  bloqueia o funil e contradiz o desenho.
--
-- O que muda:
--  - DEFAULT da coluna passa a 'active'. Novos signups via /register entram
--    direto no dashboard com FREE_ROUTES + active_modules seedados pelo
--    trigger trg_clinics_freemium_seed (0189).
--  - Clínicas existentes em pending são promovidas para active SE forem
--    cadastros recentes (is_legacy=FALSE). Cadastros legacy em pending
--    são intocados — pendência ali significa decisão histórica do suporte.
--  - CHECK constraint e o comentário antigo continuam — 'pending' ainda é
--    valor válido, agora reservado para SysMax suspender manualmente uma
--    clínica suspeita.
-- =============================================================================

BEGIN;

-- ─── 1. Novo DEFAULT para a coluna ──────────────────────────────────────────
ALTER TABLE clinics
  ALTER COLUMN status SET DEFAULT 'active';

-- ─── 2. Liberar pending atuais que são signups Freemium (não legacy) ───────
-- Backfill seguro: legacy em pending fica como está (decisão do suporte).
UPDATE clinics
SET status = 'active'
WHERE status = 'pending'
  AND is_legacy = FALSE;

-- ─── 3. Atualiza o COMMENT para refletir o novo significado ─────────────────
COMMENT ON COLUMN clinics.status IS
  'active (default) = operacional | pending = suspensão temporária administrativa pela Sysmax | suspended = inadimplência ou bloqueio definitivo. Refator Freemium 2026-05-26: signups Free entram direto como active; pending deixou de ser passagem obrigatória do onboarding.';

COMMIT;
