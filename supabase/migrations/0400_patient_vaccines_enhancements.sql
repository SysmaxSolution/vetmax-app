-- 0400_patient_vaccines_enhancements.sql
-- M7 (Sprint Almavet) — vacinação rica no consultório.
-- Campos estruturados de vacina: tipo, dose atual/total, fabricante, lote, validade.
-- Aditiva e idempotente.

ALTER TABLE patient_vaccines ADD COLUMN IF NOT EXISTS vaccine_type   TEXT;
ALTER TABLE patient_vaccines ADD COLUMN IF NOT EXISTS dose_number    INTEGER;
ALTER TABLE patient_vaccines ADD COLUMN IF NOT EXISTS dose_total     INTEGER;
ALTER TABLE patient_vaccines ADD COLUMN IF NOT EXISTS manufacturer   TEXT;
ALTER TABLE patient_vaccines ADD COLUMN IF NOT EXISTS lot_number     TEXT;
ALTER TABLE patient_vaccines ADD COLUMN IF NOT EXISTS validity_date  DATE;
