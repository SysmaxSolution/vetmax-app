-- =============================================================================
-- VetMax — Migration 0003: Fix Payment Status Constraint
-- Adiciona 'courtesy' como valor válido para payment_status
-- =============================================================================

-- Remover constraint antigo que não aceita 'courtesy'
ALTER TABLE consultations
DROP CONSTRAINT IF EXISTS consultations_payment_status_check;

-- Criar novo constraint com 'courtesy' incluído
ALTER TABLE consultations
ADD CONSTRAINT consultations_payment_status_check
CHECK (payment_status IN ('pending', 'paid', 'courtesy'));

-- Comentário: Esta migration corrige o constraint criado em 0002
-- que não tinha 'courtesy' inicialmente.
