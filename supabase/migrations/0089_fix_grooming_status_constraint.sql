-- =============================================================================
-- VetMax — Migration 0089: Fix grooming_sessions.status constraint
-- A coluna `status` (0032) só aceitava valores legados; `current_status` (0043)
-- foi estendido com 'scheduled','arrived','drying','paid','cancelled' mas a
-- constraint da coluna `status` nunca foi atualizada — causando violação ao
-- mover cards de volta para "Agendados" no Kanban.
-- =============================================================================

BEGIN;

ALTER TABLE grooming_sessions
  DROP CONSTRAINT IF EXISTS grooming_sessions_status_check;

ALTER TABLE grooming_sessions
  ADD CONSTRAINT grooming_sessions_status_check
  CHECK (status IN (
    'scheduled',
    'received',
    'arrived',
    'bathing',
    'grooming',
    'drying',
    'waiting_pickup',
    'paid',
    'delivered',
    'cancelled'
  ));

COMMIT;
