-- ─── Migration 0029: Add status column to clinics ──────────────────────────
-- Controla se a clínica está ativa, pendente de liberação ou suspensa.
-- Clínicas existentes são ativadas automaticamente.

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('active', 'pending', 'suspended'));

-- Clínicas já existentes passam para active
UPDATE clinics SET status = 'active' WHERE status = 'pending';
