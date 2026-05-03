-- =============================================================================
-- VetMax — Migration 0045: RPC Functions & Advanced Triggers
-- Módulo Banho e Tosa — Máquina de estados, availability check, reserve, receipt
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. RPC: Update Grooming Status (máquina de estados validation)
-- =========================================================================
CREATE OR REPLACE FUNCTION rpc_grooming_update_status(
  p_session_id UUID,
  p_new_status TEXT,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  session_id UUID,
  status TEXT,
  transition_id UUID,
  transitioned_at TIMESTAMPTZ
) AS $$
DECLARE
  v_session RECORD;
  v_from_status TEXT;
  v_actor_role TEXT;
  v_transition_id UUID;
  v_timestamp TIMESTAMPTZ;
  v_valid_transition BOOLEAN := false;
BEGIN
  -- 1. Fetch current session
  SELECT id, current_status, clinic_id, created_by
  INTO v_session FROM grooming_sessions
  WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  v_from_status := v_session.current_status;

  -- 2. Fetch actor role
  SELECT role INTO v_actor_role FROM profiles WHERE id = p_actor_id LIMIT 1;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Actor not found: %', p_actor_id;
  END IF;

  -- 3. Validate state machine transition
  v_valid_transition := CASE
    WHEN v_from_status = 'scheduled' AND p_new_status IN ('arrived', 'cancelled') THEN true
    WHEN v_from_status = 'arrived' AND p_new_status IN ('bathing', 'cancelled') THEN true
    WHEN v_from_status = 'bathing' AND p_new_status IN ('grooming', 'cancelled') THEN true
    WHEN v_from_status = 'grooming' AND p_new_status IN ('drying', 'cancelled') THEN true
    WHEN v_from_status = 'drying' AND p_new_status IN ('waiting_pickup', 'cancelled') THEN true
    WHEN v_from_status = 'waiting_pickup' AND p_new_status IN ('paid', 'cancelled') THEN true
    WHEN v_from_status = 'paid' AND p_new_status IN ('delivered', 'cancelled') THEN true
    ELSE false
  END;

  IF NOT v_valid_transition THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_from_status, p_new_status;
  END IF;

  -- 4. Validate permissions (role-based)
  CASE
    WHEN p_new_status = 'arrived' AND v_actor_role NOT IN ('receptionist', 'admin') THEN
      RAISE EXCEPTION 'Only receptionist/admin can check-in';
    WHEN p_new_status IN ('bathing', 'drying') AND v_actor_role NOT IN ('assistant', 'admin') THEN
      RAISE EXCEPTION 'Only assistant/admin can mark bathing/drying';
    WHEN p_new_status = 'grooming' AND v_actor_role NOT IN ('assistant', 'admin') THEN
      RAISE EXCEPTION 'Only assistant/admin can mark grooming';
    WHEN p_new_status IN ('paid', 'delivered') AND v_actor_role NOT IN ('receptionist', 'admin') THEN
      RAISE EXCEPTION 'Only receptionist/admin can process payment/delivery';
    ELSE NULL;
  END CASE;

  -- 5. Update session status
  UPDATE grooming_sessions
  SET current_status = p_new_status, updated_at = NOW()
  WHERE id = p_session_id;

  -- 6. Create audit trail (WORM)
  v_timestamp := NOW();
  INSERT INTO grooming_status_transitions (
    clinic_id, grooming_session_id, from_status, to_status,
    actor_id, actor_role, reason, transitioned_at
  ) VALUES (
    v_session.clinic_id, p_session_id, v_from_status, p_new_status,
    p_actor_id, v_actor_role, p_reason, v_timestamp
  ) RETURNING id INTO v_transition_id;

  -- 7. Return
  RETURN QUERY SELECT p_session_id, p_new_status::TEXT, v_transition_id, v_timestamp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 2. RPC: Check Professional Availability (free slots for date)
-- =========================================================================
CREATE OR REPLACE FUNCTION rpc_professional_check_availability(
  p_professional_id UUID,
  p_clinic_id UUID,
  p_date DATE
)
RETURNS TABLE (
  slot_id UUID,
  start_time TIME,
  end_time TIME,
  available_spots INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gs.id,
    gs.start_time,
    gs.end_time,
    (gs.capacity - gs.booked_count)::INTEGER AS available_spots
  FROM grooming_slots gs
  WHERE gs.professional_schedule_id IN (
    SELECT id FROM professional_schedules
    WHERE professional_id = p_professional_id
    AND clinic_id = p_clinic_id
    AND date = p_date
  )
  AND gs.status = 'available'
  AND gs.date = p_date
  AND NOT EXISTS (
    SELECT 1 FROM professional_unavailability pu
    WHERE pu.professional_id = p_professional_id
    AND pu.start_date <= p_date
    AND pu.end_date >= p_date
  )
  ORDER BY gs.start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 3. RPC: Reserve Slot (atomic, prevents race conditions with SELECT FOR UPDATE)
-- =========================================================================
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
BEGIN
  -- SELECT FOR UPDATE: lock the row to prevent race conditions
  SELECT id, booked_count, capacity, status
  INTO v_slot FROM grooming_slots
  WHERE id = p_slot_id
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

  -- Increment booked_count
  UPDATE grooming_slots
  SET booked_count = booked_count + 1
  WHERE id = p_slot_id
  RETURNING booked_count INTO v_slot.booked_count;

  -- Create assignment
  INSERT INTO grooming_slot_assignments (
    clinic_id, grooming_session_id, grooming_slot_id, professional_id, position_in_queue
  ) SELECT
    gs.clinic_id, p_session_id, p_slot_id, ps.professional_id, p_queue_position
  FROM grooming_slots gs
  JOIN professional_schedules ps ON gs.professional_schedule_id = ps.id
  WHERE gs.id = p_slot_id;

  v_success := true;

  RETURN QUERY SELECT p_slot_id, v_slot.booked_count, p_queue_position, v_success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 4. RPC: Generate Grooming Receipt
-- =========================================================================
CREATE OR REPLACE FUNCTION rpc_generate_grooming_receipt(
  p_session_id UUID
)
RETURNS TABLE (
  receipt_id UUID,
  receipt_data JSONB
) AS $$
DECLARE
  v_receipt_id UUID;
  v_receipt_json JSONB;
  v_session RECORD;
  v_discount_amount NUMERIC;
  v_service_price NUMERIC;
BEGIN
  -- Fetch session details
  SELECT
    gs.id, gs.patient_id, gs.tutor_id, gs.clinic_id,
    gs.service_prices, gs.price_total, gs.discount_percent,
    gs.payment_status, gs.check_in_at, gs.check_out_at,
    gs.created_by, gs.status
  INTO v_session FROM grooming_sessions gs
  WHERE gs.id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  -- Calculate final prices
  v_service_price := COALESCE(v_session.price_total, 0);
  v_discount_amount := (v_service_price * COALESCE(v_session.discount_percent, 0)) / 100;

  -- Build receipt JSON
  v_receipt_json := jsonb_build_object(
    'session_id', v_session.id,
    'receipt_date', NOW()::DATE,
    'patient_id', v_session.patient_id,
    'tutor_id', v_session.tutor_id,
    'clinic_id', v_session.clinic_id,
    'service_price', v_service_price,
    'discount_amount', v_discount_amount,
    'discount_percent', COALESCE(v_session.discount_percent, 0),
    'total_paid', v_service_price - v_discount_amount,
    'payment_status', v_session.payment_status,
    'professional_id', v_session.created_by,
    'check_in_time', v_session.check_in_at,
    'check_out_time', v_session.check_out_at,
    'services', v_session.service_prices
  );

  -- Create document record (update if exists)
  INSERT INTO grooming_documents (
    session_id, clinic_id, file_name, file_type, storage_path,
    user_name, created_by, document_type, document_data
  ) VALUES (
    v_session.id, v_session.clinic_id, 'receipt-' || v_session.id::TEXT,
    'pdf', 'receipts/' || v_session.clinic_id::TEXT,
    'system', auth.uid(), 'receipt', v_receipt_json
  ) ON CONFLICT (session_id) WHERE file_name LIKE 'receipt-%' DO UPDATE SET
    document_data = v_receipt_json,
    created_by = auth.uid()
  RETURNING id INTO v_receipt_id;

  -- Update session with receipt
  UPDATE grooming_sessions
  SET receipt_json = v_receipt_json, updated_at = NOW()
  WHERE id = p_session_id;

  RETURN QUERY SELECT v_receipt_id, v_receipt_json;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 5. Trigger: Cascade cancel slots when professional becomes unavailable
-- =========================================================================
CREATE OR REPLACE FUNCTION fn_cascade_cancel_slots_on_unavailability()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE grooming_slots
  SET status = 'cancelled', updated_at = NOW()
  WHERE professional_schedule_id IN (
    SELECT id FROM professional_schedules
    WHERE professional_id = NEW.professional_id
    AND clinic_id = NEW.clinic_id
    AND date BETWEEN NEW.start_date AND NEW.end_date
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cascade_cancel_slots ON professional_unavailability;
CREATE TRIGGER trg_cascade_cancel_slots
  AFTER INSERT ON professional_unavailability
  FOR EACH ROW EXECUTE FUNCTION fn_cascade_cancel_slots_on_unavailability();

-- =========================================================================
-- 6. Trigger: Data Anonymization (LGPD compliance - optional, runs manually)
-- =========================================================================
CREATE OR REPLACE FUNCTION fn_anonymize_old_grooming_data(p_days_ago INTEGER DEFAULT 730)
RETURNS TABLE (rows_anonymized INTEGER) AS $$
DECLARE
  v_rows_affected INTEGER := 0;
BEGIN
  -- Anonymize sessions older than specified days (default 2 years = 730 days)
  UPDATE grooming_sessions
  SET
    notes = 'ANONYMIZED',
    check_in_checklist = '{}'::jsonb,
    receipt_json = '{}'::jsonb
  WHERE created_at < NOW() - (p_days_ago || ' days')::INTERVAL
  AND created_at > NOW() - ((p_days_ago + 1) || ' days')::INTERVAL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  RETURN QUERY SELECT v_rows_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 7. Trigger: Prevent session cancellation if payment already processed
-- =========================================================================
CREATE OR REPLACE FUNCTION fn_validate_session_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_status = 'cancelled' AND OLD.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Cannot cancel session with processed payment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_session_cancellation ON grooming_sessions;
CREATE TRIGGER trg_validate_session_cancellation
  BEFORE UPDATE ON grooming_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_validate_session_cancellation();

COMMIT;
