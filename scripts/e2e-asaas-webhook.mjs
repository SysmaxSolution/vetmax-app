// E2E do gating R6 (Fase 2): monta uma assinatura PENDING na Vet Teste, dispara
// um PAYMENT_CONFIRMED no webhook DEPLOYADO (auth por token sandbox) e verifica
// que activatePaidSubscription ligou os módulos premium + lifecycle_state='active'.
// Snapshot/restore total — a Vet Teste volta exatamente ao estado anterior.
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })

const CLINIC = '06fd6aca-0f80-45ac-a552-220af5a242ae' // Vet Teste
const URL = process.env.E2E_WEBHOOK_URL || 'https://sysvetmax.sysmaxsolutions.com/api/webhooks/asaas'
const TOKEN = process.env.SANDBOX_ASAAS_WEBHOOK_TOKEN
const PREMIUM_KEYS = ['whatsapp', 'sales', 'pharmacy', 'hospitalization']
const ts = Date.now()
const CUS = 'e2e_cus_' + ts, SUB = 'e2e_sub_' + ts, PAY = 'e2e_pay_' + ts
const J = (v) => JSON.stringify(v)

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
let snapSub = null, snapClinic = null, snapContracts = [], snapQuota = null, hadSub = false
try {
  if (!TOKEN) throw new Error('SANDBOX_ASAAS_WEBHOOK_TOKEN ausente no .env.local')

  // ── snapshot ──
  snapSub = (await c.query('SELECT * FROM tenant_subscriptions WHERE clinic_id=$1', [CLINIC])).rows[0] ?? null
  hadSub = !!snapSub
  snapClinic = (await c.query('SELECT active_modules, flow_config, user_limit FROM clinics WHERE id=$1', [CLINIC])).rows[0]
  snapContracts = (await c.query('SELECT module_key, is_active FROM clinic_contracted_modules WHERE clinic_id=$1', [CLINIC])).rows
  snapQuota = (await c.query("SELECT limit_amount FROM tenant_quotas WHERE clinic_id=$1 AND resource_name='custom_documents'", [CLINIC])).rows[0] ?? null
  console.log('snapshot Vet Teste → plan/lifecycle =', snapSub?.plan_name, '/', snapSub?.lifecycle_state, '| contratos:', snapContracts.length)

  // ── setup: pending premium + active_modules baseline (sem as premium keys) ──
  const baseline = ['reception', 'patients', 'cashier', 'management']
  await c.query('UPDATE clinics SET active_modules=$2::jsonb WHERE id=$1', [CLINIC, J(baseline)])
  await c.query(
    `INSERT INTO tenant_subscriptions
       (clinic_id, plan_name, status, lifecycle_state, is_grandfathered, billing_cycle,
        custom_price, current_period_end, asaas_customer_id, asaas_subscription_id, last_payment_status, payment_payload)
     VALUES ($1,'premium','active','pending',false,'monthly',null, now()+interval '1 month', $2,$3,'PENDING',$4::jsonb)
     ON CONFLICT (clinic_id) DO UPDATE SET
       plan_name='premium', status='active', lifecycle_state='pending', is_grandfathered=false,
       billing_cycle='monthly', asaas_customer_id=$2, asaas_subscription_id=$3,
       last_payment_status='PENDING', payment_payload=$4::jsonb`,
    [CLINIC, CUS, SUB, J({ gateway: 'asaas', plan: 'premium', method: 'pix', addon_keys: [] })]
  )

  const before = (await c.query('SELECT active_modules FROM clinics WHERE id=$1', [CLINIC])).rows[0].active_modules
  const beforeHas = PREMIUM_KEYS.filter(k => before.includes(k))
  console.log('PENDING montado → active_modules =', J(before), '| premium presentes:', beforeHas.length, '(esperado 0)')

  // ── dispara o webhook deployado (com retry p/ tolerar lag de deploy) ──
  const body = { event: 'PAYMENT_CONFIRMED', payment: { id: PAY, customer: CUS, subscription: SUB, value: 99, status: 'CONFIRMED', billingType: 'PIX', dueDate: '2026-06-18' } }
  let res, json = {}, lifecycle = null, after = []
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': TOKEN }, body: J(body) })
    json = await res.json().catch(() => ({}))
    console.log(`webhook tentativa ${attempt}: HTTP ${res.status} ${J(json)}`)
    lifecycle = (await c.query('SELECT lifecycle_state FROM tenant_subscriptions WHERE clinic_id=$1', [CLINIC])).rows[0].lifecycle_state
    after = (await c.query('SELECT active_modules FROM clinics WHERE id=$1', [CLINIC])).rows[0].active_modules
    if (lifecycle === 'active') break
    if (attempt < 3) { console.log('  lifecycle ainda pending — aguardando 20s (deploy?)…'); await new Promise(r => setTimeout(r, 20000)) }
  }

  const afterHas = PREMIUM_KEYS.filter(k => after.includes(k))
  const inv = (await c.query('SELECT status, paid_at FROM subscription_invoices WHERE asaas_payment_id=$1', [PAY])).rows[0] ?? null

  console.log('\n=== RESULTADO ===')
  console.log('HTTP:', res.status, '| matched:', json.matched)
  console.log('lifecycle_state:', lifecycle, '(esperado: active)')
  console.log('módulos premium após pagamento:', J(afterHas), `(esperado: ${PREMIUM_KEYS.length})`)
  console.log('invoice registrada:', inv ? `${inv.status} / paid_at=${inv.paid_at}` : 'NENHUMA')
  const pass = res.status === 200 && json.matched === true && lifecycle === 'active' && afterHas.length === PREMIUM_KEYS.length && !!inv
  console.log(pass ? '\n✅ PASS — gating R6 funciona ponta a ponta' : '\n❌ FAIL')
  process.exitCode = pass ? 0 : 1
} catch (e) {
  console.error('ERRO NO TESTE:', e.message); process.exitCode = 1
} finally {
  // ── restore ──
  try {
    if (snapClinic) {
      await c.query('UPDATE clinics SET active_modules=$2::jsonb, flow_config=$3::jsonb, user_limit=$4 WHERE id=$1',
        [CLINIC, J(snapClinic.active_modules), J(snapClinic.flow_config), snapClinic.user_limit])
    }
    for (const r of snapContracts) {
      await c.query('UPDATE clinic_contracted_modules SET is_active=$3 WHERE clinic_id=$1 AND module_key=$2', [CLINIC, r.module_key, r.is_active])
    }
    if (snapQuota) {
      await c.query("UPDATE tenant_quotas SET limit_amount=$2 WHERE clinic_id=$1 AND resource_name='custom_documents'", [CLINIC, snapQuota.limit_amount])
    }
    if (hadSub) {
      await c.query(
        `UPDATE tenant_subscriptions SET plan_name=$2, status=$3, lifecycle_state=$4, is_grandfathered=$5,
           billing_cycle=$6, custom_price=$7, current_period_end=$8, asaas_customer_id=$9,
           asaas_subscription_id=$10, last_payment_status=$11, payment_payload=$12 WHERE clinic_id=$1`,
        [CLINIC, snapSub.plan_name, snapSub.status, snapSub.lifecycle_state, snapSub.is_grandfathered,
         snapSub.billing_cycle, snapSub.custom_price, snapSub.current_period_end, snapSub.asaas_customer_id,
         snapSub.asaas_subscription_id, snapSub.last_payment_status, snapSub.payment_payload ? J(snapSub.payment_payload) : null])
    } else {
      await c.query('DELETE FROM tenant_subscriptions WHERE clinic_id=$1', [CLINIC])
    }
    await c.query('DELETE FROM subscription_invoices WHERE asaas_payment_id=$1', [PAY])
    console.log('(restaurado: Vet Teste voltou ao snapshot + invoice de teste removida)')
  } catch (e) { console.error('FALHA AO RESTAURAR (verificar manualmente!):', e.message) }
  await c.end()
}
