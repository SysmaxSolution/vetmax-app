-- ─── Migration 0012: Campo exam_notes na tabela consultations ─────────────────
-- Permite que o técnico de exames envie um recado interno ao médico veterinário

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS exam_notes TEXT;
