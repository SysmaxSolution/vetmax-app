-- =============================================================================
-- VetMax — Migration 0017: Campos Clínicos Fixos do Pet (CRM Global)
-- coat_color, reproductive_status, medical_history para enriquecer a ficha
-- =============================================================================

ALTER TABLE patients ADD COLUMN IF NOT EXISTS coat_color TEXT;            -- Pelagem detalhada (ex: 'Branco', 'Tigrado', 'Tricolor')
ALTER TABLE patients ADD COLUMN IF NOT EXISTS reproductive_status TEXT;   -- Status reprodutivo (ex: 'Castrado', 'Inteiro', 'Fêmea Inteira')
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_history TEXT;       -- Histórico médico/cirúrgico (texto livre)

-- =============================================================================
-- Fim da migration 0017
-- =============================================================================
