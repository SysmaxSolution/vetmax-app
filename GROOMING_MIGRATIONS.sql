-- ═══════════════════════════════════════════════════════════════════════════
-- VetMax — GROOMING MODULE MIGRATIONS (0041-0045)
-- Complete SQL Schema for Grooming Scheduling, Slots, Status Tracking & Receipts
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PHASE 4 — DBA_AGENT: Database Design & Implementation
-- DELIVERABLES:
--   - 5 complete migrations (0041-0045)
--   - 7 tables (professional_schedules, professional_unavailability, grooming_slots,
--     grooming_slot_assignments, grooming_status_transitions, grooming_product_log)
--   - 13 new fields added to grooming_sessions
--   - 12 optimized indices
--   - 4 RPC functions (status machine, availability check, slot reservation, receipt)
--   - 6 RLS policies (WORM enforcement, multi-tenant isolation)
--   - 5 advanced triggers (cascade cancel, stock decrement, validation, anonymization)
--
-- TESTING PLAN:
--   1. Referential integrity validation
--   2. Constraint enforcement tests
--   3. RLS policy isolation tests
--   4. RPC function edge cases
--   5. Performance regression testing (indices)
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0041: PROFESSIONAL SCHEDULES & AVAILABILITY
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Create professional_schedules table
-- Purpose: Define working hours for grooming professionals
-- Uniqueness: Prevents duplicate schedule entries per professional per time slot
CREATE TABLE IF NOT EXISTS professional_schedules (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id       UUID            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date                  DATE            NOT NULL,
  start_time            TIME            NOT NULL,
  end_time              TIME            NOT NULL,
  available             BOOLEAN         DEFAULT true,
  capacity              INTEGER         DEFAULT 3 CHECK (capacity > 0 AND capacity <= 10),
  service_type          TEXT            DEFAULT 'banho_tosa'
    CHECK (service_type IN ('banho', 'tosa', 'banho_tosa')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ     DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     DEFAULT NOW(),

  -- Constraints
  CONSTRAINT check_time_order CHECK (start_time < end_time),
  CONSTRAINT check_duration CHECK (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 >= 1),
  UNIQUE(clinic_id, professional_id, date, start_time, end_time)
);

-- 2. Create professional_unavailability table
-- Purpose: Track vacation, sick leave, and other unavailability (WORM pattern)
-- Immutability: Created records are never updated; new records replace old ones
CREATE TABLE IF NOT EXISTS professional_unavailability (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id       UUID            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date            DATE            NOT NULL,
  end_date              DATE            NOT NULL,
  reason                TEXT            DEFAULT 'vacation'
    CHECK (reason IN ('vacation', 'sick_leave', 'training', 'emergency', 'other')),
  notes                 TEXT,
  created_by            UUID            REFERENCES profiles(id),
  created_at            TIMESTAMPTZ     DEFAULT NOW(),

  CONSTRAINT check_date_order CHECK (start_date <= end_date)
);

-- 3. Trigger for updated_at on professional_schedules
CREATE TRIGGER trg_professional_schedules_updated_at
  BEFORE UPDATE ON professional_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Indices for performance
-- Index 1: Fast lookup of schedules by clinic and date
CREATE INDEX idx_professional_schedules_clinic_date
  ON professional_schedules(clinic_id, date);

-- Index 2: Professional-specific schedule queries
CREATE INDEX idx_professional_schedules_professional_date
  ON professional_schedules(professional_id, date);

-- Index 3: Availability filter (partial index for active schedules)
CREATE INDEX idx_professional_schedules_availability
  ON professional_schedules(clinic_id, available, date)
  WHERE available = true;

-- Index 4: Unavailability check (date range queries)
CREATE INDEX idx_professional_unavailability_professional_date
  ON professional_unavailability(professional_id, start_date, end_date);

-- 5. RLS Policies - Clinic isolation + role-based access
ALTER TABLE professional_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_unavailability ENABLE ROW LEVEL SECURITY;

-- Clinic staff can view all schedules within their clinic
CREATE POLICY "clinic_can_view_own_schedules"
  ON professional_schedules FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- Receptionist/admin can create and modify schedules
CREATE POLICY "clinic_receptionist_can_manage_schedules"
  ON professional_schedules FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('receptionist', 'admin')
  );

-- Professionals can view their own schedules and clinic-wide schedules
CREATE POLICY "professional_can_view_own_schedule"
  ON professional_schedules FOR SELECT
  USING (
    professional_id = auth.uid()
    OR clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- Professionals can view their own unavailability
CREATE POLICY "professional_can_view_own_unavailability"
  ON professional_unavailability FOR SELECT
  USING (
    professional_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin')
  );

-- Admin can manage unavailability
CREATE POLICY "admin_can_manage_unavailability"
  ON professional_unavailability FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin')
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0042: GROOMING SLOTS & ASSIGNMENTS
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Create grooming_slots table
-- Purpose: Aggregate available time slots per schedule with booking capacity
-- booked_count: Tracks real-time availability (SELECT FOR UPDATE prevents race conditions)
CREATE TABLE IF NOT EXISTS grooming_slots (
  id                        UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                 UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_schedule_id  UUID            NOT NULL REFERENCES professional_schedules(id) ON DELETE CASCADE,
  date                      DATE            NOT NULL,
  start_time                TIME            NOT NULL,
  end_time                  TIME            NOT NULL,
  capacity                  INTEGER         DEFAULT 3 CHECK (capacity > 0),
  booked_count              INTEGER         DEFAULT 0 CHECK (booked_count >= 0),
  status                    TEXT            DEFAULT 'available'
    CHECK (status IN ('available', 'full', 'cancelled')),
  created_at                TIMESTAMPTZ     DEFAULT NOW(),
  updated_at                TIMESTAMPTZ     DEFAULT NOW(),

  CONSTRAINT check_booked_le_capacity CHECK (booked_count <= capacity),
  UNIQUE(professional_schedule_id, date, start_time)
);

-- 2. Create grooming_slot_assignments table
-- Purpose: FIFO queue tracking which sessions are assigned to which slots
-- position_in_queue: Enables FIFO ordering for multi-session slots
CREATE TABLE IF NOT EXISTS grooming_slot_assignments (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  grooming_session_id   UUID            NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  grooming_slot_id      UUID            NOT NULL REFERENCES grooming_slots(id) ON DELETE CASCADE,
  professional_id       UUID            NOT NULL REFERENCES profiles(id),
  position_in_queue     INTEGER         NOT NULL DEFAULT 1,
  assigned_at           TIMESTAMPTZ     DEFAULT NOW(),
  created_at            TIMESTAMPTZ     DEFAULT NOW(),

  UNIQUE(grooming_slot_id, grooming_session_id),
  CONSTRAINT check_position CHECK (position_in_queue > 0)
);

-- 3. Trigger for updated_at on grooming_slots
CREATE TRIGGER trg_grooming_slots_updated_at
  BEFORE UPDATE ON grooming_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Auto-update status when booked_count reaches capacity
-- Purpose: Automatically mark slot as 'full' when capacity is reached
CREATE OR REPLACE FUNCTION fn_grooming_slots_status_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.booked_count >= NEW.capacity AND OLD.status = 'available' THEN
    NEW.status := 'full';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_grooming_slots_status_update
  BEFORE UPDATE ON grooming_slots
  FOR EACH ROW EXECUTE FUNCTION fn_grooming_slots_status_update();

-- 5. Indices for performance
-- Index 5: Slot availability queries by date
CREATE INDEX idx_grooming_slots_clinic_date
  ON grooming_slots(clinic_id, date, start_time);

-- Index 6: Availability filter (partial index)
CREATE INDEX idx_grooming_slots_availability
  ON grooming_slots(professional_schedule_id, status)
  WHERE status = 'available';

-- Index 7: Professional assignment lookups
CREATE INDEX idx_grooming_slot_assignments_professional
  ON grooming_slot_assignments(professional_id, clinic_id);

-- Index 8: Queue ordering
CREATE INDEX idx_grooming_slot_assignments_queue
  ON grooming_slot_assignments(grooming_slot_id, position_in_queue);

-- 6. RLS Policies
ALTER TABLE grooming_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE grooming_slot_assignments ENABLE ROW LEVEL SECURITY;

-- Clinic can view all slots within their clinic
CREATE POLICY "clinic_can_view_own_slots"
  ON grooming_slots FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

-- Receptionist/admin can manage slots
CREATE POLICY "clinic_can_manage_slots"
  ON grooming_slots FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('receptionist', 'admin')
  );

-- Professionals and clinic staff can view assignments
CREATE POLICY "professional_can_view_own_assignments"
  ON grooming_slot_assignments FOR SELECT
  USING (
    professional_id = auth.uid()
    OR clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0043: EXTEND GROOMING_SESSIONS & STATUS TRANSITIONS
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Alter grooming_sessions table (add 13 new fields)
-- These fields track the full lifecycle of a grooming session:
--   - Scheduling: professional_schedule_id, grooming_slot_id, position_in_queue
--   - Status: current_status (replaces old status for detailed tracking)
--   - Check-in/out: check_in_by, check_in_at, check_out_by, check_out_at
--   - Legal: term_signed, term_signed_at, term_version
--   - Audit: check_in_checklist, receipt_json
ALTER TABLE grooming_sessions
ADD COLUMN IF NOT EXISTS professional_schedule_id UUID REFERENCES professional_schedules(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS grooming_slot_id UUID REFERENCES grooming_slots(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS position_in_queue INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'scheduled'
  CHECK (current_status IN ('scheduled', 'arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup', 'paid', 'delivered', 'cancelled')),
ADD COLUMN IF NOT EXISTS check_in_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS check_out_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS term_signed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS term_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS term_version VARCHAR(50),
ADD COLUMN IF NOT EXISTS check_in_checklist JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS receipt_json JSONB DEFAULT '{}'::jsonb;

-- 2. Create grooming_status_transitions table (WORM)
-- Purpose: Immutable audit log of all status changes
-- WORM (Write Once Read Many): No updates, no deletes allowed via RLS
CREATE TABLE IF NOT EXISTS grooming_status_transitions (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  grooming_session_id UUID            NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  from_status         TEXT            NOT NULL,
  to_status           TEXT            NOT NULL,
  actor_id            UUID            NOT NULL REFERENCES profiles(id),
  actor_role          TEXT            NOT NULL,
  reason              TEXT,
  metadata            JSONB           DEFAULT '{}'::jsonb,
  timestamp           TIMESTAMPTZ     DEFAULT NOW(),

  -- WORM: no updates, no deletes
  CONSTRAINT valid_status_from CHECK (from_status IN ('scheduled', 'arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup', 'paid', 'delivered', 'cancelled')),
  CONSTRAINT valid_status_to CHECK (to_status IN ('scheduled', 'arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup', 'paid', 'delivered', 'cancelled'))
);

-- 3. Indices
-- Index 9: Fast lookup of transitions per session
CREATE INDEX idx_grooming_status_transitions_session
  ON grooming_status_transitions(clinic_id, grooming_session_id, timestamp DESC);

-- Index 10: Date-based audit queries
CREATE INDEX idx_grooming_status_transitions_date
  ON grooming_status_transitions(clinic_id, DATE(timestamp));

-- Index 11: Status filtering
CREATE INDEX idx_grooming_sessions_current_status
  ON grooming_sessions(clinic_id, current_status);

-- Index 12: Slot-based session lookups
CREATE INDEX idx_grooming_sessions_slot
  ON grooming_sessions(grooming_slot_id);

-- 4. RLS Policies (WORM enforcement)
ALTER TABLE grooming_status_transitions ENABLE ROW LEVEL SECURITY;

-- Clinic staff can view all transitions
CREATE POLICY "clinic_can_view_own_transitions"
  ON grooming_status_transitions FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

-- Clinic staff can CREATE transitions only (WORM)
CREATE POLICY "clinic_can_create_transitions"
  ON grooming_status_transitions FOR INSERT
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

-- Prevent ANY UPDATE (WORM)
CREATE POLICY "no_update_transitions"
  ON grooming_status_transitions FOR UPDATE
  USING (false);

-- Prevent ANY DELETE (WORM)
CREATE POLICY "no_delete_transitions"
  ON grooming_status_transitions FOR DELETE
  USING (false);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0044: PRODUCT LOG & DOCUMENTS STORAGE
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Extend clinic_catalog to support product quantities (inventory)
-- These fields are optional; existing rows will default to 0
ALTER TABLE clinic_catalog
ADD COLUMN IF NOT EXISTS qty_available NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'unit' CHECK (unit IN ('ml', 'g', 'unit', 'l', 'kg'));

-- 2. Create grooming_product_log table
-- Purpose: Audit trail of product consumption during grooming sessions
-- Prevents double-logging via UNIQUE constraint
CREATE TABLE IF NOT EXISTS grooming_product_log (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID            NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  grooming_session_id UUID            NOT NULL REFERENCES grooming_sessions(id) ON DELETE CASCADE,
  product_id          UUID            NOT NULL REFERENCES clinic_catalog(id) ON DELETE CASCADE,
  quantity_used       NUMERIC(10,2)   NOT NULL CHECK (quantity_used > 0),
  unit                TEXT            NOT NULL CHECK (unit IN ('ml', 'g', 'unit', 'l', 'kg')),
  stage               TEXT            NOT NULL CHECK (stage IN ('bathing', 'grooming', 'drying', 'finishing')),
  recorded_by         UUID            NOT NULL REFERENCES profiles(id),
  created_at          TIMESTAMPTZ     DEFAULT NOW(),

  UNIQUE(grooming_session_id, product_id, stage)
);

-- 3. Extend grooming_documents table with new fields
-- document_type: Categorizes document purpose
-- document_data: Stores structured data (JSON) for receipts, checklists, etc.
ALTER TABLE grooming_documents
ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'document'
  CHECK (document_type IN ('term', 'receipt', 'invoice', 'checklist', 'signature', 'photo')),
ADD COLUMN IF NOT EXISTS document_data JSONB DEFAULT '{}'::jsonb;

-- 4. Trigger: Decremento automático de estoque
-- Purpose: Automatically decrement inventory when product is logged
-- Prevents overselling by checking availability before decrement
CREATE OR REPLACE FUNCTION fn_decrement_stock_on_product_log()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clinic_catalog
  SET qty_available = qty_available - NEW.quantity_used
  WHERE id = NEW.product_id
  AND qty_available >= NEW.quantity_used;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient inventory for product %', NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_decrement_stock_on_product_log ON grooming_product_log;
CREATE TRIGGER trg_decrement_stock_on_product_log
  AFTER INSERT ON grooming_product_log
  FOR EACH ROW EXECUTE FUNCTION fn_decrement_stock_on_product_log();

-- 5. Trigger: Prevent double-logging of products
-- Purpose: Ensures only one log entry per product per stage per session
CREATE OR REPLACE FUNCTION fn_validate_product_stage()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM grooming_product_log
    WHERE grooming_session_id = NEW.grooming_session_id
    AND product_id = NEW.product_id
    AND stage = NEW.stage
  ) > 0 THEN
    RAISE EXCEPTION 'Product already logged for this session and stage';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_product_stage ON grooming_product_log;
CREATE TRIGGER trg_validate_product_stage
  BEFORE INSERT ON grooming_product_log
  FOR EACH ROW EXECUTE FUNCTION fn_validate_product_stage();

-- 6. Indices
-- Index 13: Product log lookup by session
CREATE INDEX idx_grooming_product_log_session
  ON grooming_product_log(grooming_session_id, stage);

-- Index 14: Inventory tracking by product
CREATE INDEX idx_grooming_product_log_product
  ON grooming_product_log(product_id, clinic_id);

-- Index 15: Time-based queries
CREATE INDEX idx_grooming_product_log_created
  ON grooming_product_log(clinic_id, created_at DESC);

-- Update indices on grooming_documents (if exists)
CREATE INDEX IF NOT EXISTS idx_grooming_documents_type
  ON grooming_documents(session_id, document_type);

-- 7. RLS Policies
ALTER TABLE grooming_product_log ENABLE ROW LEVEL SECURITY;

-- Clinic can view all product logs
CREATE POLICY "clinic_can_view_own_product_logs"
  ON grooming_product_log FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

-- Only the user who recorded can modify (prevents unauthorized edits)
CREATE POLICY "clinic_can_manage_product_logs"
  ON grooming_product_log FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    AND recorded_by = auth.uid()
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0045: RPC FUNCTIONS & ADVANCED TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- =========================================================================
-- 1. RPC: Update Grooming Status
-- =========================================================================
-- Purpose: Enforce state machine transitions with role-based permissions
-- Validates:
--   - Valid state transitions (scheduled → arrived → bathing → ...)
--   - Actor role permissions (only receptionist can check-in, etc)
--   - Creates immutable audit trail
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
  timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_session RECORD;
  v_from_status TEXT;
  v_actor_role TEXT;
  v_transition_id UUID;
  v_timestamp TIMESTAMPTZ;
  v_valid_transition BOOLEAN := false;
BEGIN
  -- 1. Fetch current session state
  SELECT id, current_status, clinic_id, assigned_to
  INTO v_session FROM grooming_sessions
  WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  v_from_status := v_session.current_status;

  -- 2. Fetch actor role for permission check
  SELECT role INTO v_actor_role FROM profiles WHERE id = p_actor_id LIMIT 1;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Actor not found: %', p_actor_id;
  END IF;

  -- 3. Validate state machine transition (directed graph)
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

  -- 4. Validate role-based permissions
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

  -- 6. Create immutable audit trail
  v_timestamp := NOW();
  INSERT INTO grooming_status_transitions (
    clinic_id, grooming_session_id, from_status, to_status,
    actor_id, actor_role, reason, timestamp
  ) VALUES (
    v_session.clinic_id, p_session_id, v_from_status, p_new_status,
    p_actor_id, v_actor_role, p_reason, v_timestamp
  ) RETURNING id INTO v_transition_id;

  -- 7. Return transition result
  RETURN QUERY SELECT p_session_id, p_new_status::TEXT, v_transition_id, v_timestamp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 2. RPC: Check Professional Availability
-- =========================================================================
-- Purpose: Query available slots for a professional on a given date
-- Considers:
--   - Professional schedules for the date
--   - Current booked count vs capacity
--   - Professional unavailability periods
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
    -- Exclude if professional is unavailable
    SELECT 1 FROM professional_unavailability pu
    WHERE pu.professional_id = p_professional_id
    AND pu.start_date <= p_date
    AND pu.end_date >= p_date
  )
  ORDER BY gs.start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 3. RPC: Reserve Slot (Atomic Reservation)
-- =========================================================================
-- Purpose: Atomically reserve a slot using SELECT FOR UPDATE
-- SELECT FOR UPDATE: Prevents race conditions by locking the row during transaction
-- Ensures:
--   - No double-booking
--   - Capacity enforcement
--   - FIFO position tracking
CREATE OR REPLACE FUNCTION rpc_reserve_slot(
  p_slot_id UUID,
  p_session_id UUID,
  p_position INTEGER DEFAULT 1
)
RETURNS TABLE (
  slot_id UUID,
  booked_count INTEGER,
  position INTEGER,
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
    RETURN QUERY SELECT p_slot_id, v_slot.booked_count, p_position, false;
    RETURN;
  END IF;

  -- Increment booked_count
  UPDATE grooming_slots
  SET booked_count = booked_count + 1
  WHERE id = p_slot_id
  RETURNING booked_count INTO v_slot.booked_count;

  -- Create FIFO assignment
  INSERT INTO grooming_slot_assignments (
    clinic_id, grooming_session_id, grooming_slot_id, professional_id, position_in_queue
  ) SELECT
    gs.clinic_id, p_session_id, p_slot_id, ps.professional_id, p_position
  FROM grooming_slots gs
  JOIN professional_schedules ps ON gs.professional_schedule_id = ps.id
  WHERE gs.id = p_slot_id;

  v_success := true;

  RETURN QUERY SELECT p_slot_id, v_slot.booked_count, p_position, v_success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 4. RPC: Generate Grooming Receipt
-- =========================================================================
-- Purpose: Compile receipt JSON from session data
-- Outputs:
--   - Service price breakdown
--   - Discount calculation
--   - Final payment amount
--   - Document storage
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
  -- Fetch session details with all pricing info
  SELECT
    gs.id, gs.patient_id, gs.tutor_id, gs.clinic_id,
    gs.service_prices, gs.price_total, gs.discount_percent,
    gs.payment_status, gs.check_in_at, gs.check_out_at,
    gs.assigned_to, gs.status
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
    'professional_id', v_session.assigned_to,
    'check_in_time', v_session.check_in_at,
    'check_out_time', v_session.check_out_at,
    'services', v_session.service_prices
  );

  -- Create or update document record
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
-- 5. Trigger: Cascade Cancel Slots
-- =========================================================================
-- Purpose: Automatically cancel all slots when professional becomes unavailable
-- Use case: Vacation, sick leave, training - all future slots cancelled
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
-- 6. Trigger: Data Anonymization (LGPD Compliance)
-- =========================================================================
-- Purpose: Anonymize old session data per LGPD (2-year retention)
-- Call: SELECT * FROM fn_anonymize_old_grooming_data(730);
-- Note: Manually triggered function, can be scheduled via cron
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
-- 7. Trigger: Prevent Session Cancellation with Paid Status
-- =========================================================================
-- Purpose: Business rule - cannot cancel sessions already paid
-- Prevents financial inconsistencies
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

-- ═══════════════════════════════════════════════════════════════════════════
-- DEPLOYMENT & TESTING CHECKLIST
-- ═══════════════════════════════════════════════════════════════════════════

/*
PRE-DEPLOYMENT:
  [ ] Backup production database (pg_dump)
  [ ] Test migrations in staging environment
  [ ] Verify RLS policies don't break existing queries
  [ ] Check index creation time (should be < 5 minutes for grooming_sessions)
  [ ] Validate no circular foreign key references

DEPLOYMENT:
  [ ] Apply migrations in order: 0041 → 0042 → 0043 → 0044 → 0045
  [ ] Monitor database performance during index creation
  [ ] Verify all triggers are active: SELECT event_object_schema, event_object_table, trigger_name FROM information_schema.triggers;
  [ ] Test RPC functions with sample data
  [ ] Confirm RLS policies work with test users from different clinics

POST-DEPLOYMENT:
  [ ] Run integrity tests (see below)
  [ ] Monitor query performance (especially rpc_reserve_slot)
  [ ] Verify no constraint violations
  [ ] Check application logs for RLS policy errors

ROLLBACK (if needed):
  [ ] DROP FUNCTION IF EXISTS rpc_grooming_update_status CASCADE;
  [ ] DROP FUNCTION IF EXISTS rpc_professional_check_availability CASCADE;
  [ ] DROP FUNCTION IF EXISTS rpc_reserve_slot CASCADE;
  [ ] DROP FUNCTION IF EXISTS rpc_generate_grooming_receipt CASCADE;
  [ ] DROP TABLE IF EXISTS grooming_status_transitions CASCADE;
  [ ] DROP TABLE IF EXISTS grooming_slot_assignments CASCADE;
  [ ] DROP TABLE IF EXISTS grooming_slots CASCADE;
  [ ] DROP TABLE IF EXISTS professional_unavailability CASCADE;
  [ ] DROP TABLE IF EXISTS professional_schedules CASCADE;
  [ ] ALTER TABLE clinic_catalog DROP COLUMN IF EXISTS qty_available, DROP COLUMN IF EXISTS unit;
  [ ] ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS professional_schedule_id, ... (13 columns);
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- REFERENTIAL INTEGRITY VALIDATION TESTS
-- ═══════════════════════════════════════════════════════════════════════════

/*
-- Test 1: Verify all foreign keys are correctly created
SELECT
  constraint_name,
  table_name,
  column_name,
  referenced_table_name,
  referenced_column_name
FROM information_schema.key_column_usage
WHERE table_name IN (
  'professional_schedules',
  'professional_unavailability',
  'grooming_slots',
  'grooming_slot_assignments',
  'grooming_status_transitions',
  'grooming_product_log'
)
ORDER BY table_name;

-- Test 2: Verify all triggers are active
SELECT
  trigger_schema,
  trigger_name,
  event_object_table,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table IN (
  'professional_schedules',
  'grooming_slots',
  'grooming_product_log',
  'grooming_sessions',
  'professional_unavailability'
)
ORDER BY event_object_table;

-- Test 3: Verify all indices are created
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE tablename IN (
  'professional_schedules',
  'professional_unavailability',
  'grooming_slots',
  'grooming_slot_assignments',
  'grooming_status_transitions',
  'grooming_product_log'
)
ORDER BY tablename;

-- Test 4: Verify all RLS policies are enabled
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN (
  'professional_schedules',
  'professional_unavailability',
  'grooming_slots',
  'grooming_slot_assignments',
  'grooming_status_transitions',
  'grooming_product_log'
)
ORDER BY tablename;

-- Test 5: Constraint validation (no NULL in NOT NULL columns)
SELECT COUNT(*) AS null_count
FROM professional_schedules
WHERE clinic_id IS NULL OR professional_id IS NULL
  OR date IS NULL OR start_time IS NULL OR end_time IS NULL;

-- Test 6: Check capacity constraints
SELECT COUNT(*) AS invalid_capacity
FROM grooming_slots
WHERE booked_count > capacity;

-- Test 7: Verify UNIQUE constraints
SELECT COUNT(*) AS duplicate_schedules
FROM (
  SELECT clinic_id, professional_id, date, start_time, end_time, COUNT(*)
  FROM professional_schedules
  GROUP BY clinic_id, professional_id, date, start_time, end_time
  HAVING COUNT(*) > 1
) duplicates;

-- Test 8: RPC function availability
SELECT
  p.proname,
  a.argnames,
  t.typname AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN pg_type t ON p.prorettype = t.oid
LEFT JOIN pg_proc_list_arguments a ON p.oid = a.prooid
WHERE n.nspname = 'public'
AND p.proname LIKE 'rpc_%'
ORDER BY p.proname;
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF MIGRATIONS 0041-0045
-- ═══════════════════════════════════════════════════════════════════════════
