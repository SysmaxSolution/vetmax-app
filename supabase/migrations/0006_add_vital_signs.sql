-- =============================================================================
-- VetMax — Migration 0006: Adicionar Sinais Vitais como JSONB
-- Implementa armazenamento estruturado de sinais vitais (triagem)
-- =============================================================================

-- Adicionar coluna vital_signs em consultations
-- Estrutura: { weight, temperature, heart_rate, respiratory_rate, mucous_color, crt, chief_complaint }
ALTER TABLE consultations
ADD COLUMN IF NOT EXISTS vital_signs JSONB DEFAULT NULL;

-- Comentário: Estrutura esperada do JSONB:
-- {
--   "weight": 12.5,                    -- kg (NUMERIC)
--   "temperature": 38.5,              -- °C (NUMERIC)
--   "heart_rate": 85,                 -- bpm (INTEGER)
--   "respiratory_rate": 25,           -- movimentos/min (INTEGER)
--   "mucous_color": "pink",           -- (pink, pale, icteric, cyanotic)
--   "crt": "2s",                      -- Capillary Refill Time (2s, 3s, 4s)
--   "chief_complaint": "tosse persistente..." -- (TEXT) Transcrição ou digitação
-- }

-- Índice para consultas rápidas de triagens realizadas
CREATE INDEX IF NOT EXISTS idx_consultations_vital_signs
    ON consultations(clinic_id, status, created_at)
    WHERE vital_signs IS NOT NULL;

-- =============================================================================
-- Fim da migration 0006
-- =============================================================================
