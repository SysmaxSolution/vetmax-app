-- =============================================================================
-- VetMax — Migration 0002: Governança de Recepção
-- Adiciona campos para Motivo da Visita, Data Agendada e Checklist da Clínica
-- =============================================================================

-- 1. Adicionar coluna visit_reason em consultations
ALTER TABLE consultations
ADD COLUMN IF NOT EXISTS visit_reason TEXT CHECK (visit_reason IN (
    'consultation',    -- Consulta comum
    'follow_up',       -- Retorno
    'emergency',       -- Emergência
    'vaccination',     -- Vacinação
    'exam',            -- Exame
    'surgery'          -- Cirurgia
)) DEFAULT 'consultation';

-- 2. Adicionar coluna scheduled_date em consultations (data agendada, diferente de appointment_date)
ALTER TABLE consultations
ADD COLUMN IF NOT EXISTS scheduled_date TIMESTAMPTZ;

-- 3. Atualizar CHECK constraint de payment_status para aceitar 'courtesy'
ALTER TABLE consultations
DROP CONSTRAINT IF EXISTS consultations_payment_status_check;

ALTER TABLE consultations
ADD CONSTRAINT consultations_payment_status_check
CHECK (payment_status IN ('pending', 'paid', 'courtesy'));

-- 4. Adicionar coluna reception_checklist em clinics (array JSON com obrigações do check-in)
ALTER TABLE clinics
ADD COLUMN IF NOT EXISTS reception_checklist JSONB DEFAULT '["Confirmar endereço atualizado", "Assinar termo de atendimento", "Informar contato de emergência"]'::JSONB;

-- 4. Índice para visit_reason (filtros de relatório)
CREATE INDEX IF NOT EXISTS idx_consultations_visit_reason
    ON consultations(clinic_id, visit_reason);

-- 5. Índice composto para busca de consultations por status + motivo
CREATE INDEX IF NOT EXISTS idx_consultations_clinic_status_reason
    ON consultations(clinic_id, status, visit_reason, created_at);

-- =============================================================================
-- Fim da migration 0002
-- =============================================================================
