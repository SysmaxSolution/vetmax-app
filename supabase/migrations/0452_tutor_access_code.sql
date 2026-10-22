-- 0452 — Login permanente do tutor por CPF + código (Fase 3).
-- O tutor passa a poder entrar sempre que quiser com CPF + um código gerado pela
-- clínica (além do link mágico no WhatsApp, que vira onboarding/reset). Aditiva.
BEGIN;
ALTER TABLE tutor_users
  ADD COLUMN IF NOT EXISTS access_code_hash   text,
  ADD COLUMN IF NOT EXISTS access_code_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS code_fail_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS code_locked_until  timestamptz;
COMMIT;
