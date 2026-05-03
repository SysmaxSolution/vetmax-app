-- =============================================================================
-- VetMax — Migration 0047: Grooming → Central Cashier Integration
-- Remove receipt_amount logic, add trigger to central_cashier on session.paid
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Remove old receipt columns if they exist (backward compat)
-- =========================================================================

ALTER TABLE grooming_sessions
  DROP COLUMN IF EXISTS receipt_amount,
  DROP COLUMN IF EXISTS received_by,
  DROP COLUMN IF EXISTS received_at;

-- =========================================================================
-- 2. Add payment_recorded_at to track when cashier entry created
-- =========================================================================

ALTER TABLE grooming_sessions
  ADD COLUMN IF NOT EXISTS payment_recorded_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN grooming_sessions.payment_recorded_at IS 'When payment was pushed to central_cashier';

-- =========================================================================
-- 3. RPC: Finish Grooming Session and Record Payment
-- Transitions: drying → waiting_pickup (check-in).
-- Transitions: waiting_pickup → paid (automatic cashier push).
-- =========================================================================

CREATE OR REPLACE FUNCTION rpc_grooming_finish_and_record_payment(
  p_session_id UUID,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  session_id UUID,
  status TEXT,
  cashier_entry_id UUID,
  transitioned_at TIMESTAMPTZ
) AS $$
DECLARE
  v_session RECORD;
  v_clinic_id UUID;
  v_payment_total NUMERIC(12, 2);
  v_cashier_id UUID;
  v_timestamp TIMESTAMPTZ;
BEGIN
  -- 1. Fetch current session
  SELECT id, clinic_id, current_status, price_total, payment_status
  INTO v_session FROM grooming_sessions
  WHERE id = p_session_id AND current_status = 'waiting_pickup';

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or not in waiting_pickup status: %', p_session_id;
  END IF;

  v_clinic_id := v_session.clinic_id;
  v_payment_total := COALESCE(v_session.price_total, 0);

  -- 2. Transition session to paid
  UPDATE grooming_sessions
  SET current_status = 'paid', payment_status = 'paid', payment_recorded_at = NOW()
  WHERE id = p_session_id;

  -- 3. Create central_cashier entry if amount > 0
  IF v_payment_total > 0 THEN
    INSERT INTO central_cashier (
      clinic_id, source_module, source_id, amount, status, reason, recorded_by
    ) VALUES (
      v_clinic_id,
      'grooming',
      p_session_id,
      v_payment_total,
      'recorded',
      COALESCE(p_reason, 'Grooming session payment'),
      p_actor_id
    )
    RETURNING id INTO v_cashier_id;
  ELSE
    v_cashier_id := NULL;
  END IF;

  v_timestamp := NOW();

  -- 4. Return
  RETURN QUERY SELECT p_session_id, 'paid'::TEXT, v_cashier_id, v_timestamp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 4. RPC: Update Grooming Session Status (extended state machine)
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
  SELECT id, current_status, clinic_id
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

  -- 3. Validate state machine (no more receipt-related states)
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
    WHEN p_new_status IN ('bathing', 'grooming', 'drying') AND v_actor_role NOT IN ('assistant', 'admin') THEN
      RAISE EXCEPTION 'Only assistant/admin can handle bathing/grooming/drying';
    WHEN p_new_status IN ('waiting_pickup', 'paid', 'delivered') AND v_actor_role NOT IN ('receptionist', 'admin') THEN
      RAISE EXCEPTION 'Only receptionist/admin can process pickup/payment/delivery';
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
-- 5. Index for cashier queries on grooming
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_grooming_payment_recorded
  ON grooming_sessions (clinic_id, payment_recorded_at DESC)
  WHERE payment_recorded_at IS NOT NULL;

COMMIT;
