# VetMax Core Management — Implementation Diffs

## Arquivo: src/lib/actions/grooming.ts

### DIFF 1: Remove receipt logic from updateGroomingStatus

```diff
--- a/src/lib/actions/grooming.ts
+++ b/src/lib/actions/grooming.ts
@@ -231,11 +231,22 @@ export async function createGroomingSession(data: {
 // ─── Atualizar Status ─────────────────────────────────────────────────────
 
 export async function updateGroomingStatus(
   sessionId: string,
-  status:     GroomingStatus,
-): Promise<{ success: true } | { error: string }> {
+  status:     GroomingStatus,
+): Promise<{ success: true } | { error: string }> {
+  // DEPRECATED: Use updateGroomingStatusViaRPC from grooming-cashier.ts instead
+  // This function is kept for backward compatibility but does NOT handle cashier integration
+  
   const ctx = await getClinicAndUser()
   if ('error' in ctx) return ctx
   const { supabase } = ctx
 
   const patch: Record<string, unknown> = { status }
   if (status === 'bathing')    patch.started_at   = new Date().toISOString()
   if (status === 'delivered')  patch.completed_at = new Date().toISOString()
 
   const { error } = await supabase
     .from('grooming_sessions')
     .update(patch)
     .eq('id', sessionId)
 
   if (error) return { error: 'Erro ao atualizar status: ' + error.message }
 
   revalidatePath('/dashboard/grooming')
   return { success: true }
 }
```

### DIFF 2: Remove updateGroomingPaymentStatus (moved to grooming-cashier.ts)

```diff
--- a/src/lib/actions/grooming.ts
+++ b/src/lib/actions/grooming.ts
@@ -410,23 +410,4 @@ export async function updateGroomingPricing(
   return { success: true, price_total }
 }
 
-// ─── Marcar Sessão como Paga / Isenta ────────────────────────────────────────
-
-export async function updateGroomingPaymentStatus(
-  sessionId:     string,
-  paymentStatus: 'pending' | 'paid' | 'waived',
-): Promise<{ success: true } | { error: string }> {
-  const ctx = await getClinicAndUser()
-  if ('error' in ctx) return ctx
-  const { supabase } = ctx
-
-  const { error } = await supabase
-    .from('grooming_sessions')
-    .update({ payment_status: paymentStatus })
-    .eq('id', sessionId)
-
-  if (error) return { error: 'Erro ao atualizar pagamento: ' + error.message }
-
-  revalidatePath('/dashboard/grooming')
-  return { success: true }
-}
+// MOVED: Use finishGroomingSessionAndRecord() from grooming-cashier.ts instead
```

---

## Arquivo: src/types/index.ts

### DIFF 3: Add grooming session status types with payment tracking

```diff
--- a/src/types/index.ts
+++ b/src/types/index.ts
@@ -1,6 +1,6 @@
-export type GroomingStatus =
-  | 'received'
-  | 'bathing'
-  | 'grooming'
-  | 'waiting_pickup'
-  | 'delivered'
+export type GroomingStatus =
+  | 'scheduled'
+  | 'arrived'
+  | 'bathing'
+  | 'grooming'
+  | 'drying'
+  | 'waiting_pickup'
+  | 'paid'
+  | 'delivered'
+  | 'cancelled'
```

---

## Environment Variables

### ADD to .env.local:

```bash
# Core Module Governance
SYSMAX_MASTER_KEY=your-secret-key-here
MODULE_GOVERNANCE_STRICT=false  # Set to true to enforce master key validation
```

---

## Database Migrations Applied

**File 1:** `supabase/migrations/0046_core_management_tables.sql`
- ✅ Adds clinic_settings columns (business_hours, working_days, holiday_work)
- ✅ Creates product_prices table (multi-tenant, with RLS)
- ✅ Creates central_cashier table (accounting ledger)
- ✅ Audit triggers for central_cashier changes
- ✅ Business hours validation trigger

**File 2:** `supabase/migrations/0047_grooming_cashier_integration.sql`
- ✅ Removes old receipt_amount, received_by, received_at columns
- ✅ Adds payment_recorded_at to grooming_sessions
- ✅ Creates rpc_grooming_finish_and_record_payment() RPC
- ✅ Updates rpc_grooming_update_status() with state machine validation
- ✅ Indexes for payment tracking

---

## Server Actions Added

**File 1:** `src/lib/actions/scheduling-validation.ts`
- `validateSchedulingSlot()` — Validates time slots against clinic_settings
- `getAvailableSlots()` — Returns available time slots for a date

**File 2:** `src/lib/actions/core-management.ts`
- `listProductPrices()` — List pricing catalog
- `upsertProductPrice()` — Create/update product prices
- `deactivateProductPrice()` — Soft delete product
- `recordCashierEntry()` — Record manual payment/adjustment
- `listCashierEntries()` — List cashier ledger with filters
- `getCashierSummary()` — Accounting summary for date range
- `verifyCashierEntry()` — Mark entry as verified (accountant)
- `archiveCashierEntry()` — Hide completed entries

**File 3:** `src/lib/actions/grooming-cashier.ts`
- `finishGroomingSessionAndRecord()` — Transitions to paid + creates cashier entry
- `updateGroomingStatusViaRPC()` — RPC-based status update with validation
- `getGroomingSessionDetail()` — Fetch session with payment info
- `getGroomingCashierEntry()` — Get related cashier entry

---

## Module Governance

**File 1:** `src/lib/module-governance.ts`
- `verifyMasterKey()` — Hash-based key verification
- `canEnableModule()` — Check role + module whitelist + master key
- `moduleGovernanceMiddleware()` — Next.js route protection helper
- `hashMasterKey()` — Pre-hash keys for storage

**File 2:** `src/middleware-module-governor.ts`
- `moduleProtectionMiddleware()` — Middleware for API routes
- `checkModuleAccess()` — Server Action helper for module gating

---

## Types Added

**File:** `src/types/core-management.ts`
- `Category` — Product categories enum
- `CashierModule` — Cashier source modules
- `CashierStatus` — Ledger entry status
- `ClinicSettings` — Business hours + working days
- `ProductPrice` — Pricing catalog entry
- `CentralCashierEntry` — Ledger entry
- `CashierDailyReport` — Accounting summary
- `SlotAvailability` — Scheduling availability

---

## Integration Points

### 1. Grooming Cards → Central Cashier
When a grooming session transitions to **"paid"**:
- RPC `rpc_grooming_finish_and_record_payment()` automatically creates a `central_cashier` entry
- Amount pulled from `grooming_sessions.price_total`
- Source tracked as `grooming | {session_id}`
- No manual receipt logic needed

### 2. Slot Validation
Before allowing a grooming booking:
- Call `validateSchedulingSlot()` to check:
  - Clinic business_hours for day
  - working_days array
  - Existing session conflicts
  - Time fits within operating hours

### 3. Module Access Control
Before enabling a module feature:
- Call `checkModuleAccess(moduleName)` in Server Actions
- Or use `moduleProtectionMiddleware()` in API routes
- Master key validation optional (via `MODULE_GOVERNANCE_STRICT`)

---

## Migration Execution Order

```bash
# 1. Apply migrations in order
npx supabase migration up

# OR manually:
psql -h your-host -U postgres -d vetmax < supabase/migrations/0046_core_management_tables.sql
psql -h your-host -U postgres -d vetmax < supabase/migrations/0047_grooming_cashier_integration.sql

# 2. Verify RPC functions exist
SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_name LIKE 'rpc_%';

# 3. Test cashier entry creation
INSERT INTO product_prices (clinic_id, name, category, price) VALUES (...);
```

---

## Testing Checklist

- [ ] Product prices CRUD works with RLS filtering by clinic_id
- [ ] Central cashier entries have clinic_id isolation
- [ ] Grooming session payment transitions correctly via RPC
- [ ] Master key validation blocks/allows module enable
- [ ] Scheduling validation rejects out-of-hours bookings
- [ ] Cashier entries appear immediately after grooming session completion
- [ ] Audit log captures all cashier mutations
