-- 0033: Documenta coluna status da tabela clinics (já existente no DB com DEFAULT 'pending').
-- Novas clínicas inseridas sem status explícito ficam como 'pending' até liberação pela Sysmax.
-- Clínicas existentes foram mantidas como 'active' na criação original da coluna.

-- A coluna já existe; este script é idempotente.
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'active', 'suspended'));

COMMENT ON COLUMN clinics.status IS
  'pending = aguardando aprovação Sysmax | active = operacional | suspended = suspenso';
