// REVERSÃO DE EMERGÊNCIA do downgrade Almavet (12/08/2026).
// Aplica o snapshot scripts/almavet-snapshot-2026-08-12.json verbatim:
// contratos reativados + active_modules/flow_config exatos + assinatura como era.
// Uso: node scripts/restore-almavet.mjs  (lê .env.local)
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => /^[A-Z_0-9]+=/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const snap = JSON.parse(readFileSync(new URL('./almavet-snapshot-2026-08-12.json', import.meta.url), 'utf8'))
const CID = snap.clinic_id

// 1) contratos: estado exato do snapshot (todos true à época)
for (const [key, active] of Object.entries(snap.contracts_estado)) {
  const { error } = await admin.from('clinic_contracted_modules')
    .upsert({ clinic_id: CID, module_key: key, is_active: active }, { onConflict: 'clinic_id,module_key' })
  if (error) { console.error('contrato', key, error.message); process.exit(1) }
}
// 2) clinics verbatim
{
  const { error } = await admin.from('clinics')
    .update({ active_modules: snap.active_modules, flow_config: snap.flow_config }).eq('id', CID)
  if (error) { console.error('clinics', error.message); process.exit(1) }
}
// 3) assinatura: campos-chave como no snapshot
{
  const s = snap.subscription
  const { error } = await admin.from('tenant_subscriptions').update({
    plan_name: s.plan_name, status: s.status, lifecycle_state: s.lifecycle_state,
    custom_price: s.custom_price, is_grandfathered: s.is_grandfathered,
    last_payment_status: s.last_payment_status, billing_cycle: s.billing_cycle,
    payment_payload: s.payment_payload, past_due_since: s.past_due_since,
  }).eq('clinic_id', CID)
  if (error) { console.error('subscription', error.message); process.exit(1) }
}
console.log('Almavet restaurada ao snapshot de 12/08 ✔')
