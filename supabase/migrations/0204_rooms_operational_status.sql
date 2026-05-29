-- =============================================================================
-- VetMax — Migration 0204: Status operacional dos Boxes/Salas (Cadastros)
--
-- Infraestrutura física da clínica (Cadastros > Boxes / Salas). rooms já tem
-- capacity, active e daily_rate (0200); falta o status operacional para a UI:
-- 'active' (em operação) ou 'maintenance' (em manutenção — não recebe paciente).
-- Aditiva, IF NOT EXISTS.
-- =============================================================================

BEGIN;

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS operational_status TEXT NOT NULL DEFAULT 'active';

-- CHECK idempotente.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_operational_status_check') THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_operational_status_check
      CHECK (operational_status IN ('active', 'maintenance'));
  END IF;
END $$;

COMMENT ON COLUMN rooms.operational_status IS 'Status de operação do leito/sala: active (em operação) ou maintenance (em manutenção).';

COMMIT;
