-- Migration 0029: Adiciona campo is_controlled em applied_medications
-- Necessário para sinalizar medicamentos controlados (DCBs) — requisito CFMV

ALTER TABLE applied_medications
  ADD COLUMN IF NOT EXISTS is_controlled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN applied_medications.is_controlled IS 'true = medicamento de controle especial (Receita Azul/Amarela — CFMV)';
