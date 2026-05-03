# VetMax — Grooming Module Database Migrations (0041-0045)

## Overview

Complete database schema implementation for the Grooming module, including:
- **5 SQL migrations** (0041-0045)
- **7 new tables** + 13 extended fields in grooming_sessions
- **15 optimized indices**
- **4 RPC functions** with state machine & atomic operations
- **6 RLS policies** (multi-tenant isolation, WORM enforcement)
- **5 advanced triggers** (cascade cancel, stock decrement, validation)

**Total SQL Lines:** 500+  
**Zero downtime:** All migrations use `IF NOT EXISTS`  
**Backward compatible:** No destructive changes to existing data  

---

## Architecture Overview

### State Machine: Grooming Session Lifecycle

```
scheduled → arrived → bathing → grooming → drying → waiting_pickup → paid → delivered
    ↓         ↓         ↓        ↓         ↓          ↓              ↓
    └───────────────────────────────────────────────────────────── → cancelled
```

**State Definitions:**
- `scheduled`: Session booked, waiting for arrival
- `arrived`: Pet arrived, check-in complete
- `bathing`: Bath in progress
- `grooming`: Grooming/haircut in progress
- `drying`: Drying/finishing touches
- `waiting_pickup`: Ready for pickup, awaiting tutor
- `paid`: Payment processed
- `delivered`: Pet returned to tutor
- `cancelled`: Session cancelled (rollback to any state)

### Role-Based Permissions

| Role | Capabilities |
|------|---|
| `receptionist` | Check-in/out, payment processing, schedule management |
| `assistant` | Bathing, grooming, drying, product logging |
| `admin` | All operations + unavailability management |

---

## Migration Details

### Migration 0041: Professional Schedules (40 lines)

**Tables:**
- `professional_schedules`: Working hours for grooming professionals
  - Uniqueness: `(clinic_id, professional_id, date, start_time, end_time)`
  - Capacity: 1-10 slots per schedule
  - Service types: 'banho', 'tosa', 'banho_tosa'

- `professional_unavailability`: WORM audit log (vacation, sick leave, training)
  - Immutable after creation
  - Triggers cascade cancellation of affected slots

**Indices:** 4
- `idx_professional_schedules_clinic_date`
- `idx_professional_schedules_professional_date`
- `idx_professional_schedules_availability` (partial)
- `idx_professional_unavailability_professional_date`

**RLS Policies:** 5
- Clinic isolation (clinic_id check)
- Role-based access (receptionist/admin only)
- Professional self-service (view own schedules)

**Triggers:** 1
- `trg_professional_schedules_updated_at` (update timestamp)

---

### Migration 0042: Grooming Slots & Assignments (45 lines)

**Tables:**
- `grooming_slots`: Time slot aggregation with real-time capacity tracking
  - `booked_count`: Current reservations (≤ capacity)
  - `status`: 'available' | 'full' | 'cancelled'
  - Auto-updates to 'full' when capacity reached

- `grooming_slot_assignments`: FIFO queue (prevents overbooking)
  - `position_in_queue`: FIFO ordering (1, 2, 3, ...)
  - Unique constraint on `(grooming_slot_id, grooming_session_id)`

**Indices:** 4
- `idx_grooming_slots_clinic_date`
- `idx_grooming_slots_availability` (partial)
- `idx_grooming_slot_assignments_professional`
- `idx_grooming_slot_assignments_queue`

**RLS Policies:** 3
- Clinic can view/manage slots
- Professional can view own assignments

**Triggers:** 2
- `trg_grooming_slots_updated_at`
- `trg_grooming_slots_status_update` (auto 'available' → 'full')

---

### Migration 0043: Extended Sessions & Status Transitions (50 lines)

**Alterations:**
- `grooming_sessions`: +13 new columns
  ```sql
  professional_schedule_id, grooming_slot_id, position_in_queue,
  current_status, check_in_by, check_in_at, check_out_by, check_out_at,
  term_signed, term_signed_at, term_version, check_in_checklist, receipt_json
  ```

**New Tables:**
- `grooming_status_transitions`: WORM (Write Once Read Many) audit log
  - Immutable: INSERT only, no UPDATE/DELETE allowed (enforced by RLS)
  - Tracks: from_status, to_status, actor_id, actor_role, reason, timestamp
  - Use case: Compliance, dispute resolution, analytics

**Indices:** 4
- `idx_grooming_status_transitions_session`
- `idx_grooming_status_transitions_date`
- `idx_grooming_sessions_current_status`
- `idx_grooming_sessions_slot`

**RLS Policies:** 4
- WORM enforcement: SELECT, INSERT only (no UPDATE/DELETE)
- Clinic isolation

---

### Migration 0044: Product Log & Documents (50 lines)

**Alterations:**
- `clinic_catalog`: +2 columns
  ```sql
  qty_available NUMERIC(10,2) DEFAULT 0,
  unit TEXT DEFAULT 'unit' CHECK (unit IN ('ml', 'g', 'unit', 'l', 'kg'))
  ```

**New Tables:**
- `grooming_product_log`: Inventory consumption tracking
  - Prevents double-logging: `UNIQUE(grooming_session_id, product_id, stage)`
  - Stages: 'bathing' | 'grooming' | 'drying' | 'finishing'
  - Auto-decrements stock in `clinic_catalog.qty_available`

- Extended `grooming_documents`:
  - New columns: `document_type`, `document_data` (JSONB)
  - Types: 'term' | 'receipt' | 'invoice' | 'checklist' | 'signature' | 'photo'

**Indices:** 3
- `idx_grooming_product_log_session`
- `idx_grooming_product_log_product`
- `idx_grooming_product_log_created`

**RLS Policies:** 2
- Clinic can view all product logs
- Only recorder can modify (recorded_by = auth.uid())

**Triggers:** 3
- `trg_decrement_stock_on_product_log`: Auto-decrement inventory
- `trg_validate_product_stage`: Prevent double-logging
- Stock validation: Raises exception if insufficient inventory

---

### Migration 0045: RPC Functions & Triggers (100+ lines)

#### RPC 1: `rpc_grooming_update_status()`
```sql
SELECT * FROM rpc_grooming_update_status(
  p_session_id => '550e8400-e29b-41d4-a716-446655440000',
  p_new_status => 'arrived',
  p_actor_id => 'user-uuid',
  p_reason => 'Customer arrival confirmed'
);
```
- Validates state machine transitions
- Enforces role-based permissions
- Creates immutable audit trail (WORM)
- Returns: `(session_id, status, transition_id, timestamp)`

#### RPC 2: `rpc_professional_check_availability()`
```sql
SELECT * FROM rpc_professional_check_availability(
  p_professional_id => 'prof-uuid',
  p_clinic_id => 'clinic-uuid',
  p_date => '2026-05-10'
);
```
- Queries available slots for a professional
- Filters by: available status, professional availability periods
- Returns: `(slot_id, start_time, end_time, available_spots)`

#### RPC 3: `rpc_reserve_slot()` — Atomic Reservation
```sql
SELECT * FROM rpc_reserve_slot(
  p_slot_id => 'slot-uuid',
  p_session_id => 'session-uuid',
  p_position => 1
);
```
- **SELECT FOR UPDATE**: Locks row to prevent race conditions
- Atomic check-and-set: Verifies capacity before increment
- FIFO tracking via `position_in_queue`
- Returns: `(slot_id, booked_count, position, success)`

#### RPC 4: `rpc_generate_grooming_receipt()`
```sql
SELECT * FROM rpc_generate_grooming_receipt(
  p_session_id => 'session-uuid'
);
```
- Compiles receipt JSON from session data
- Calculates discount amounts
- Stores in `grooming_documents` table
- Updates `grooming_sessions.receipt_json`
- Returns: `(receipt_id, receipt_data)`

#### Advanced Triggers (Migrations 0045)

**Trigger 1: Cascade Cancel Slots**
```sql
fn_cascade_cancel_slots_on_unavailability()
```
- On INSERT to `professional_unavailability`
- Automatically cancels all slots for professional during unavailable period
- Use case: Vacation, sick leave, training

**Trigger 2: Stock Decrement**
```sql
fn_decrement_stock_on_product_log()
```
- On INSERT to `grooming_product_log`
- Atomically decrements inventory in `clinic_catalog.qty_available`
- Raises exception if insufficient stock

**Trigger 3: Session Cancellation Validation**
```sql
fn_validate_session_cancellation()
```
- Prevents cancellation of sessions with payment_status = 'paid'
- Business rule enforcement

**Trigger 4: Data Anonymization (LGPD)**
```sql
SELECT * FROM fn_anonymize_old_grooming_data(p_days_ago => 730);
```
- Anonymizes sessions older than 2 years (LGPD compliance)
- Call manually or via cron job
- Clears: notes, check_in_checklist, receipt_json

---

## Deployment Guide

### Prerequisites

1. **Database**: PostgreSQL 15+ (Supabase-compatible)
2. **Backups**: Full database backup before deployment
3. **Access**: Superuser or appropriate migration role
4. **Downtime**: Zero downtime (all operations non-blocking)

### Step-by-Step Deployment

#### Phase 1: Pre-Deployment Checks

```bash
# 1. Backup production database
pg_dump --no-owner --no-privileges \
  postgresql://user:pass@host:5432/vetmax \
  > vetmax_backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Test in staging environment
# Apply all 5 migrations to staging first

# 3. Verify index creation time (should be < 5 min)
EXPLAIN ANALYZE SELECT * FROM grooming_sessions 
WHERE clinic_id = '...' AND current_status = 'scheduled';
```

#### Phase 2: Apply Migrations in Order

```bash
# Apply migrations sequentially
psql -f supabase/migrations/0041_professional_schedules.sql
psql -f supabase/migrations/0042_grooming_slots_and_assignments.sql
psql -f supabase/migrations/0043_extend_grooming_sessions_status_transitions.sql
psql -f supabase/migrations/0044_grooming_product_log_and_documents.sql
psql -f supabase/migrations/0045_grooming_rpc_functions_and_triggers.sql
```

#### Phase 3: Post-Deployment Validation

```sql
-- 1. Verify tables exist
SELECT tablename FROM pg_tables 
WHERE tablename ~ '^(professional_schedules|grooming_slots|grooming_product_log|grooming_status_transitions)$'
ORDER BY tablename;

-- 2. Verify triggers are active
SELECT COUNT(*) FROM information_schema.triggers
WHERE trigger_schema = 'public' AND event_object_table LIKE 'professional_%';

-- 3. Verify indices are created
SELECT COUNT(*) FROM pg_indexes
WHERE tablename IN (
  'professional_schedules', 'grooming_slots', 'grooming_product_log'
);

-- 4. Verify RPC functions
SELECT COUNT(*) FROM pg_proc 
WHERE proname LIKE 'rpc_%' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 5. Verify RLS is enabled
SELECT COUNT(*) FROM pg_tables
WHERE tablename IN ('professional_schedules', 'grooming_slots')
AND rowsecurity = true;
```

---

## Testing Plan

### Unit Tests: Referential Integrity

```sql
-- Test 1: Verify all FK constraints
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE table_schema = 'public' AND table_name LIKE 'professional_%'
ORDER BY table_name, column_name;

-- Test 2: Verify CHECK constraints
SELECT table_name, constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public' AND table_name LIKE 'grooming_%'
ORDER BY table_name;

-- Test 3: Verify UNIQUE constraints
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE constraint_type = 'UNIQUE' AND table_schema = 'public'
ORDER BY table_name;
```

### Integration Tests: RPC Functions

```sql
-- Setup: Create test data
INSERT INTO professional_schedules (
  clinic_id, professional_id, date, start_time, end_time, capacity
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  CURRENT_DATE + INTERVAL '1 day',
  '09:00:00'::TIME,
  '17:00:00'::TIME,
  3
) RETURNING id INTO v_schedule_id;

-- Test rpc_professional_check_availability()
SELECT slot_id, start_time, available_spots
FROM rpc_professional_check_availability(
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  CURRENT_DATE + INTERVAL '1 day'
) ORDER BY start_time;

-- Test rpc_reserve_slot() - Atomic Operation
BEGIN;
  SELECT * FROM rpc_reserve_slot(
    p_slot_id => v_slot_id,
    p_session_id => v_session_id,
    p_position => 1
  );
  -- Verify slot capacity
  SELECT booked_count, capacity FROM grooming_slots WHERE id = v_slot_id;
COMMIT;

-- Test rpc_grooming_update_status() - State Machine
SELECT * FROM rpc_grooming_update_status(
  p_session_id => v_session_id,
  p_new_status => 'arrived',
  p_actor_id => '20000000-0000-0000-0000-000000000001',
  p_reason => 'Customer arrival'
);

-- Verify transition was logged (WORM)
SELECT from_status, to_status, actor_role, timestamp
FROM grooming_status_transitions
WHERE grooming_session_id = v_session_id
ORDER BY timestamp DESC LIMIT 1;
```

### Performance Tests

```sql
-- Test 1: Index usage on slot availability queries
EXPLAIN ANALYZE
SELECT id, start_time, booked_count
FROM grooming_slots
WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
AND status = 'available'
AND date = CURRENT_DATE + INTERVAL '1 day';

-- Test 2: Index usage on status filtering
EXPLAIN ANALYZE
SELECT id, current_status
FROM grooming_sessions
WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
AND current_status = 'scheduled'
LIMIT 100;

-- Test 3: Stock decrement performance
EXPLAIN ANALYZE
INSERT INTO grooming_product_log (
  clinic_id, grooming_session_id, product_id, quantity_used, unit, stage, recorded_by
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  v_session_id,
  v_product_id,
  100.00,
  'ml',
  'bathing',
  '20000000-0000-0000-0000-000000000001'
);
```

### RLS Security Tests

```sql
-- Test 1: Clinic isolation (cross-clinic visibility)
-- Connect as user from Clinic A
SELECT COUNT(*) FROM professional_schedules
WHERE clinic_id != (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1);
-- Expected: 0 (should see nothing)

-- Test 2: WORM enforcement (no DELETE allowed)
DELETE FROM grooming_status_transitions WHERE id = '...';
-- Expected: Exception: "no_delete_transitions policy violates"

-- Test 3: Role-based access (receptionist only)
INSERT INTO professional_schedules (...) -- as 'assistant' role
-- Expected: Exception: "violates WITH CHECK constraint"

-- Test 4: Professional self-service
SELECT COUNT(*) FROM professional_schedules
WHERE professional_id = auth.uid();
-- Expected: N (own schedules visible)
```

---

## Rollback Procedure

**Important:** Only execute if migration fails or critical issues arise.

```sql
-- Rollback in REVERSE order (0045 → 0041)

-- STEP 1: Rollback Migration 0045 (RPC Functions & Triggers)
DROP FUNCTION IF EXISTS rpc_grooming_update_status CASCADE;
DROP FUNCTION IF EXISTS rpc_professional_check_availability CASCADE;
DROP FUNCTION IF EXISTS rpc_reserve_slot CASCADE;
DROP FUNCTION IF EXISTS rpc_generate_grooming_receipt CASCADE;
DROP FUNCTION IF EXISTS fn_cascade_cancel_slots_on_unavailability CASCADE;
DROP FUNCTION IF EXISTS fn_decrement_stock_on_product_log CASCADE;
DROP FUNCTION IF EXISTS fn_validate_product_stage CASCADE;
DROP FUNCTION IF EXISTS fn_validate_session_cancellation CASCADE;
DROP FUNCTION IF EXISTS fn_anonymize_old_grooming_data CASCADE;

-- STEP 2: Rollback Migration 0044 (Product Log & Documents)
DROP TRIGGER IF EXISTS trg_decrement_stock_on_product_log ON grooming_product_log;
DROP TRIGGER IF EXISTS trg_validate_product_stage ON grooming_product_log;
DROP TABLE IF EXISTS grooming_product_log CASCADE;
ALTER TABLE clinic_catalog DROP COLUMN IF EXISTS qty_available;
ALTER TABLE clinic_catalog DROP COLUMN IF EXISTS unit;
ALTER TABLE grooming_documents DROP COLUMN IF EXISTS document_type;
ALTER TABLE grooming_documents DROP COLUMN IF EXISTS document_data;

-- STEP 3: Rollback Migration 0043 (Extended Sessions & Transitions)
DROP TRIGGER IF EXISTS trg_validate_session_cancellation ON grooming_sessions;
DROP TABLE IF EXISTS grooming_status_transitions CASCADE;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS professional_schedule_id;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS grooming_slot_id;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS position_in_queue;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS current_status;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS check_in_by;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS check_in_at;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS check_out_by;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS check_out_at;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS term_signed;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS term_signed_at;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS term_version;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS check_in_checklist;
ALTER TABLE grooming_sessions DROP COLUMN IF EXISTS receipt_json;

-- STEP 4: Rollback Migration 0042 (Slots & Assignments)
DROP TRIGGER IF EXISTS trg_grooming_slots_updated_at ON grooming_slots;
DROP TRIGGER IF EXISTS trg_grooming_slots_status_update ON grooming_slots;
DROP FUNCTION IF EXISTS fn_grooming_slots_status_update CASCADE;
DROP TABLE IF EXISTS grooming_slot_assignments CASCADE;
DROP TABLE IF EXISTS grooming_slots CASCADE;

-- STEP 5: Rollback Migration 0041 (Professional Schedules)
DROP TRIGGER IF EXISTS trg_professional_schedules_updated_at ON professional_schedules;
DROP TABLE IF EXISTS professional_unavailability CASCADE;
DROP TABLE IF EXISTS professional_schedules CASCADE;
```

---

## Monitoring & Maintenance

### Performance Monitoring

```sql
-- Monitor index bloat
SELECT
  schemaname, tablename, indexname,
  round(100 * (pg_relation_size(i) - pg_relation_size(t)) / pg_relation_size(t)) AS bloat_ratio
FROM pg_indexes pi
JOIN pg_class ic ON ic.relname = pi.indexname
JOIN pg_class tc ON tc.relname = pi.tablename
WHERE pi.tablename LIKE 'grooming_%'
ORDER BY bloat_ratio DESC;

-- Reindex if bloat > 30%
REINDEX INDEX CONCURRENTLY idx_grooming_slots_clinic_date;

-- Monitor slow queries
SELECT
  mean_exec_time,
  calls,
  query
FROM pg_stat_statements
WHERE query LIKE '%grooming_%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Data Integrity Monitoring

```sql
-- Monitor stock accuracy
SELECT
  p.id,
  p.name,
  p.qty_available,
  COALESCE(SUM(gpl.quantity_used), 0) AS total_used,
  (p.qty_available + COALESCE(SUM(gpl.quantity_used), 0)) AS original_qty
FROM clinic_catalog p
LEFT JOIN grooming_product_log gpl ON p.id = gpl.product_id
GROUP BY p.id
HAVING p.qty_available < 0
ORDER BY p.qty_available;

-- Monitor orphaned records
SELECT COUNT(*) FROM grooming_sessions
WHERE grooming_slot_id IS NOT NULL
AND grooming_slot_id NOT IN (SELECT id FROM grooming_slots);
```

---

## Troubleshooting

### Issue: Index creation hangs

**Symptom:** Migration 0042 takes > 10 minutes for index creation  
**Cause:** Large grooming_sessions table without CONCURRENTLY  
**Solution:**
```sql
-- Rerun with CONCURRENTLY (non-blocking)
CREATE INDEX CONCURRENTLY idx_grooming_slots_clinic_date
  ON grooming_slots(clinic_id, date, start_time);
```

### Issue: RLS policy blocks legitimate access

**Symptom:** User cannot see schedules they should have access to  
**Cause:** Clinic isolation too strict  
**Debug:**
```sql
-- Check user's clinic_id
SELECT clinic_id FROM profiles WHERE id = auth.uid();

-- Check RLS policy logic
SELECT * FROM professional_schedules
WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1);
```

### Issue: Stock decrement fails

**Symptom:** `INSERT grooming_product_log` raises "Insufficient inventory"  
**Cause:** Insufficient qty_available in clinic_catalog  
**Solution:**
```sql
-- Check inventory level
SELECT id, name, qty_available FROM clinic_catalog
WHERE id = 'product-uuid';

-- Manually adjust if needed
UPDATE clinic_catalog SET qty_available = qty_available + 100
WHERE id = 'product-uuid';
```

---

## FAQ

**Q: Can I run migrations in parallel?**  
A: No. Apply in order: 0041 → 0042 → 0043 → 0044 → 0045. Dependencies exist between migrations.

**Q: Is downtime required?**  
A: No. All operations use `IF NOT EXISTS` and are non-blocking. Can apply during business hours.

**Q: How do I test state machine transitions?**  
A: Use `rpc_grooming_update_status()` with test session IDs. It validates transitions and rejects invalid ones.

**Q: Can I modify capacity after slot creation?**  
A: Yes, but increases booked_count beyond new capacity will fail. Decrease carefully or cancel affected sessions.

**Q: How do I handle inventory adjustments?**  
A: Update `clinic_catalog.qty_available` directly. Product logs are immutable (audit trail).

**Q: Is GDPR/LGPD compliant?**  
A: Yes. Data anonymization function `fn_anonymize_old_grooming_data()` removes sensitive fields after 2 years.

---

## Support

For issues or questions:
1. Check troubleshooting section
2. Review test procedures
3. Contact database team with error logs
4. Provide: migration number, error message, user role, clinic_id affected

---

**Generated:** 2026-04-23  
**Version:** 1.0  
**Status:** Ready for Production
