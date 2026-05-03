-- =============================================================================
-- VetMax — Migration 0005: Adicionar Contato de Emergência do Tutor
-- =============================================================================

-- Adicionar coluna emergency_contact em tutors
ALTER TABLE tutors
ADD COLUMN IF NOT EXISTS emergency_contact TEXT;

-- Comentário: Este campo armazena nome e telefone do contato de emergência
-- do tutor, preenchido durante o check-in na recepção.
