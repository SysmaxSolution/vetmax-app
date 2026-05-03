-- =============================================================================
-- VetMax — Migration 0049: Fix rpc_reserve_slot column ambiguity
--
-- Problema: "column reference booked_count is ambiguous" em:
--   RETURNING booked_count INTO v_slot.booked_count
-- Fix: Qualificar com alias da tabela (gs)
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION rpc_reserve_slot(
  p_slot_id UUID,
  p_session_id UUID,
  p_queue_position INTEGER DEFAULT 1
)
RETURNS TABLE (
  slot_id UUID,
  booked_count INTEGER,
  queue_position INTEGER,
  success BOOLEAN
) AS $$
DECLARE
  v_slot RECORD;
  v_can_book BOOLEAN;
  v_success BOOLEAN := false;
  v_new_booked_count INTEGER;
BEGIN
  -- SELECT FOR UPDATE: lock the row to prevent race conditions
  SELECT id, gs.booked_count, capacity, status
  INTO v_slot FROM grooming_slots gs
  WHERE gs.id = p_slot_id
  FOR UPDATE;

  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'Slot not found: %', p_slot_id;
  END IF;

  -- Check capacity (atomic check-and-set)
  v_can_book := (v_slot.booked_count < v_slot.capacity);

  IF NOT v_can_book THEN
    RETURN QUERY SELECT p_slot_id, v_slot.booked_count, p_queue_position, false;
    RETURN;
  END IF;

  -- Increment booked_count (qualificado para evitar ambiguidade)
  UPDATE grooming_slots
  SET booked_count = grooming_slots.booked_count + 1
  WHERE id = p_slot_id
  RETURNING grooming_slots.booked_count INTO v_new_booked_count;

  -- Create assignment
  INSERT INTO grooming_slot_assignments (
    clinic_id, grooming_session_id, grooming_slot_id, professional_id, position_in_queue
  ) SELECT
    gs.clinic_id, p_session_id, p_slot_id, ps.professional_id, p_queue_position
  FROM grooming_slots gs
  JOIN professional_schedules ps ON gs.professional_schedule_id = ps.id
  WHERE gs.id = p_slot_id;

  v_success := true;

  RETURN QUERY SELECT p_slot_id, v_new_booked_count, p_queue_position, v_success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
