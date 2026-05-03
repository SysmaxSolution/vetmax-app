-- =============================================================================
-- VetMax — Migration 0004: Expansão de Dados do Tutor e Pet
-- Adiciona campos clínicos e de contato necessários para a Recepção
-- =============================================================================

-- 1. Adicionar campo 'address' em tutors
ALTER TABLE tutors
ADD COLUMN IF NOT EXISTS address TEXT;

-- 2. Adicionar campos clínicos em patients
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS color TEXT;              -- Cor do animal (ex: Preto, Branco, Mesclado)

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS allergies TEXT;          -- Alergias documentadas

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS past_surgeries TEXT;     -- Histórico de cirurgias anteriores

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS chronic_diseases TEXT;   -- Doenças pré-existentes (ex: Diabetes, Hipertireoidismo)

-- =============================================================================
-- Fim da migration 0004
-- =============================================================================
