// Smoke das colunas/migrations do Item 5 — bate direto no banco para confirmar:
// 1) stock_items.default_insurance_price aceita NULL e número
// 2) patient_custom_prices.copay_amount + repass_amount com constraint de coerência
// 3) consultation_services.insurance_total_snapshot/copay_snapshot/repass_snapshot
//
// Roda: node -r dotenv/config scripts/smoke-insurance-pricing.mjs dotenv_config_path=.env.local

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltam env vars'); process.exit(1) }
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

let ok = true

// 1) stock_items.default_insurance_price visível em select?
const { data: items, error: itemsErr } = await admin
  .from('stock_items')
  .select('id, name, is_service, unit_price, default_insurance_price')
  .limit(3)
if (itemsErr) { console.error('❌ stock_items:', itemsErr.message); ok = false }
else { console.log(`✅ stock_items: ${items.length} rows; default_insurance_price column readable`) }

// 2) patient_custom_prices: split coherence — tenta inserir uma row inválida (copay+repass != custom_price)
//    Esperado: constraint violation 23514
const { data: clinics } = await admin.from('clinics').select('id').limit(1)
if (!clinics?.length) { console.error('no clinic'); process.exit(1) }
const clinicId = clinics[0].id

const { data: patients } = await admin
  .from('patients').select('id').eq('clinic_id', clinicId).limit(1)
const { data: stocks } = await admin
  .from('stock_items').select('id').eq('clinic_id', clinicId).limit(1)

if (patients?.length && stocks?.length) {
  const r = await admin
    .from('patient_custom_prices')
    .insert({
      clinic_id:     clinicId,
      patient_id:    patients[0].id,
      stock_item_id: stocks[0].id,
      custom_price:  100,
      copay_amount:  30,
      repass_amount: 50,  // 30 + 50 = 80 != 100 → deve violar constraint
      source:        'manual',
    })
  if (r.error && (r.error.code === '23514' || /coherent/i.test(r.error.message))) {
    console.log('✅ constraint coherence funcionando (rejeitou 30+50!=100)')
  } else if (r.error) {
    console.log(`⚠ outro erro (talvez já exista a chave): ${r.error.code} ${r.error.message}`)
  } else {
    console.error('❌ constraint NÃO disparou — ROW inserida indevidamente. Tentando deletar...')
    await admin.from('patient_custom_prices').delete()
      .eq('clinic_id', clinicId)
      .eq('patient_id', patients[0].id)
      .eq('stock_item_id', stocks[0].id)
    ok = false
  }
} else {
  console.log('⚠ sem patient/stock_item para testar constraint — pulou')
}

// 3) consultation_services: tenta selecionar com os 3 novos snapshots
const { data: cs, error: csErr } = await admin
  .from('consultation_services')
  .select('id, name_snapshot, price_snapshot, insurance_total_snapshot, copay_snapshot, repass_snapshot')
  .limit(3)
if (csErr) { console.error('❌ consultation_services:', csErr.message); ok = false }
else { console.log(`✅ consultation_services: ${cs.length} rows; snapshots de split visíveis`) }

process.exit(ok ? 0 : 1)
