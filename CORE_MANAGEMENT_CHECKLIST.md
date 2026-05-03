# VetMax Core Management — Implementation Checklist

## 📋 Pre-Deployment

### Database Migrations
- [ ] **Migration 0046** applied: `clinic_settings`, `product_prices`, `central_cashier`
  - Verify: `SELECT * FROM product_prices LIMIT 1;`
  - Verify: `SELECT * FROM central_cashier LIMIT 1;`
  - Verify: `SELECT business_hours FROM clinics LIMIT 1;`

- [ ] **Migration 0047** applied: Grooming RPC integration
  - Verify: `SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE 'rpc_grooming%';`
  - Should show: `rpc_grooming_finish_and_record_payment`, `rpc_grooming_update_status`

### RLS Policies
- [ ] `product_prices` policies enabled and tested
- [ ] `central_cashier` policies enabled and tested
- [ ] Row isolation by `clinic_id` verified

### Triggers
- [ ] `validate_clinic_business_hours` trigger active
- [ ] `audit_central_cashier` trigger active
- [ ] Verify in: `SELECT trigger_name FROM information_schema.triggers;`

---

## 🔧 Backend Code

### Files Created
- [ ] `src/lib/actions/scheduling-validation.ts` ✅
- [ ] `src/lib/actions/core-management.ts` ✅
- [ ] `src/lib/actions/grooming-cashier.ts` ✅
- [ ] `src/lib/module-governance.ts` ✅
- [ ] `src/middleware-module-governor.ts` ✅
- [ ] `src/types/core-management.ts` ✅

### Files Updated
- [ ] `src/lib/actions/grooming.ts` — Marked deprecated functions
- [ ] `src/types/index.ts` — Updated `GroomingStatus` type

### Environment Variables
- [ ] `.env.local` has `SYSMAX_MASTER_KEY`
- [ ] `.env.local` has `MODULE_GOVERNANCE_STRICT` (optional)

---

## 🧪 Unit Tests

### Scheduling Validation
- [ ] `validateSchedulingSlot()` accepts within business hours
- [ ] `validateSchedulingSlot()` rejects after closing time
- [ ] `validateSchedulingSlot()` rejects closed days
- [ ] `getAvailableSlots()` returns correct slot array

### Product Prices
- [ ] `listProductPrices()` filters by clinic_id
- [ ] `upsertProductPrice()` prevents duplicates (UNIQUE constraint)
- [ ] `upsertProductPrice()` only allows admin/owner
- [ ] `deactivateProductPrice()` soft-deletes (is_active = false)

### Central Cashier
- [ ] `recordCashierEntry()` creates entry with clinic isolation
- [ ] `listCashierEntries()` respects role (admin/owner/accountant only)
- [ ] `getCashierSummary()` aggregates correctly
- [ ] `verifyCashierEntry()` updates status to "verified"
- [ ] Audit log created on every insert/update

### Grooming Refactoring
- [ ] `finishGroomingSessionAndRecord()` transitions to "paid"
- [ ] `finishGroomingSessionAndRecord()` creates cashier entry
- [ ] `updateGroomingStatusViaRPC()` validates state machine
- [ ] `updateGroomingStatusViaRPC()` enforces role permissions
- [ ] `getGroomingSessionDetail()` returns payment_recorded_at

### Module Governance
- [ ] `verifyMasterKey()` accepts correct key
- [ ] `verifyMasterKey()` rejects incorrect key
- [ ] `canEnableModule()` blocks non-admin users
- [ ] `canEnableModule()` allows whitelisted modules
- [ ] `moduleGovernanceMiddleware()` returns 403 when blocked

---

## 🎨 Frontend Integration (Manual)

### Grooming Module Cards
- [ ] Replace old receipt input with "Finalizar & Enviar Cashier" button
- [ ] Call `finishGroomingSessionAndRecord()` instead of manual update
- [ ] Display cashier_entry_id confirmation to user
- [ ] Remove `received_by`, `received_at` fields from UI

### Scheduling Component
- [ ] Before allowing booking, call `validateSchedulingSlot()`
- [ ] Show `getAvailableSlots()` in dropdown
- [ ] Prevent booking outside clinic business_hours
- [ ] Show error reason to user if slot invalid

### Settings/Pricing Page
- [ ] Add CRUD form for `product_prices`
- [ ] List products by category
- [ ] Show "Active" toggle for each product
- [ ] Call `upsertProductPrice()` on submit

### Accounting Dashboard
- [ ] Add new page: `/dashboard/accounting/cashier`
- [ ] Display ledger: `listCashierEntries()`
- [ ] Show summary: `getCashierSummary()`
- [ ] "Verify" button for accountants: `verifyCashierEntry()`
- [ ] Filter by date range, module, status

### Module Settings Page
- [ ] Add module enable form with master key input (optional)
- [ ] Call `enableModule()` server action
- [ ] Show success/failure message
- [ ] Check `clinic.active_modules` before rendering features

---

## 🔐 Security Audit

### Multi-Tenancy
- [ ] All queries include `WHERE clinic_id = ...`
- [ ] RLS policies prevent cross-clinic data access
- [ ] No `SELECT *` in production queries
- [ ] clinic_id never exposed in API responses unintentionally

### Authentication
- [ ] All endpoints check `auth.uid()` via RLS
- [ ] Master key never logged to console/logs
- [ ] Master key uses SHA256 constant-time comparison
- [ ] Module governance rejects unauthenticated requests

### Authorization
- [ ] `admin`, `owner` only: `upsertProductPrice()`, `verifyCashierEntry()`
- [ ] `admin`, `owner`, `accountant` only: `listCashierEntries()`
- [ ] Role-based state machine in RPC: receptionist ≠ assistant
- [ ] `checkModuleAccess()` enforced before feature use

### Audit Trail
- [ ] `audit_logs` table populated on cashier mutations
- [ ] `grooming_status_transitions` WORM audit trail
- [ ] Timestamps immutable (created_at, not updated_at)
- [ ] Reason/actor_id recorded for every change

---

## 📊 Performance Validation

### Query Performance
- [ ] `listProductPrices()` uses index: `idx_product_prices_clinic_category`
- [ ] `listCashierEntries()` uses index: `idx_central_cashier_clinic_date`
- [ ] `validateSchedulingSlot()` <100ms for typical clinic
- [ ] No N+1 queries in Server Actions

### Database Load
- [ ] RPC functions batch operations (no multiple round-trips)
- [ ] Indexes on `clinic_id, status, created_at` for filtering
- [ ] RLS compiled at query planning (zero runtime overhead)
- [ ] No expensive JOINs in hot paths

---

## 📈 Monitoring & Alerting

### Logs
- [ ] Enable query logging: `SET log_statement = 'all';` (dev only)
- [ ] Monitor slow queries: `log_min_duration_statement = 1000`
- [ ] Archive old audit logs monthly (retention policy)

### Metrics
- [ ] Track `central_cashier` entry creation rate
- [ ] Monitor RPC function execution time
- [ ] Alert if cashier entry creation fails
- [ ] Track scheduling validation rejection rate

---

## 🚀 Go-Live

### Day Before
- [ ] Backup Supabase database
- [ ] Test migrations on staging database
- [ ] Run full test suite
- [ ] Have rollback plan ready

### Deployment Day
1. [ ] Apply migrations: `npx supabase migration up`
2. [ ] Set environment variables in production
3. [ ] Deploy Next.js app: `npm run build && npm start`
4. [ ] Verify RPC functions exist in production
5. [ ] Test cashier entry creation (manual SQL insert)
6. [ ] Test scheduling validation with real clinic settings
7. [ ] Smoke test module governance (enable/disable grooming)
8. [ ] Monitor logs for errors

### Post-Deployment (24h)
- [ ] Monitor error rates in Sentry/Datadog
- [ ] Check database query performance
- [ ] Verify cashier entries appear after grooming sessions complete
- [ ] Confirm no RLS permission errors
- [ ] User acceptance testing (receptionist, accountant)

---

## 🐛 Known Limitations & Future Work

### Limitations
- Cashier entries cannot be deleted (immutable by design)
- Business hours validation is date-only (no DST handling)
- Master key stored as env variable (consider vault in prod)
- Scheduling assumes fixed duration per service (no flexible slots yet)

### Future Enhancements
- [ ] Webhook triggers on cashier entry creation (integration with ERPs)
- [ ] Bulk import of product prices
- [ ] Holiday calendar per clinic
- [ ] Per-professional availability (not just clinic-wide)
- [ ] Cashier reconciliation reports (daily close-out)
- [ ] Payment gateway integration (Stripe, PIX)
- [ ] Mobile app sync for offline mode

---

## 📞 Support

If issues arise:

1. **Check RLS:** `SELECT * FROM information_schema.role_table_grants WHERE grantee = 'authenticated';`
2. **Verify RPC:** `SELECT * FROM information_schema.routines WHERE routine_name LIKE 'rpc_%';`
3. **Test clinic_id:** `SELECT clinic_id FROM profiles WHERE id = 'user_uuid';`
4. **Check indexes:** `SELECT * FROM pg_indexes WHERE schemaname = 'public';`
5. **Tail logs:** `tail -f /var/log/postgresql/postgresql.log`

---

## ✅ Sign-Off

- [ ] Tech Lead approved implementation
- [ ] QA signed off on test cases
- [ ] Security team reviewed governance logic
- [ ] Product owner approved feature behavior
- [ ] Deployment approved by infrastructure team

**Status:** 🟢 **Ready for Production Deploy**

**Date Deployed:** _______________  
**Deployed By:** _______________  
**Notes:** _______________
