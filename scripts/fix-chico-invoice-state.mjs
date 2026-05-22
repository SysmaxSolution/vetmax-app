// Reconcilia o estado da invoice do Chico que ficou inconsistente:
//   total_amount=74.63 mas paid_amount=150 (errado — deveria ser 0)
//   só 2 entries: pending petlove 44.63 + paid is_clinic_discount 75.37
//   faltava: paid cashier 30 (foi apagado em rollback parcial)
//
// Estratégia: apagar todas as entries da invoice e zerar paid_amount para
// que ela volte a aparecer no caixa como pendente — depois o usuário refaz
// a baixa com o novo processPayment.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const SERVICE_KEY  = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const INVOICE_ID = '19d278a9-9fe8-417a-aa8e-501977cbd0ed'

async function main() {
  // 1) Snapshot do estado atual
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, subtotal, total_amount, paid_amount, discount, status')
    .eq('id', INVOICE_ID)
    .single()
  console.log('▶ Estado atual da invoice:', JSON.stringify(inv, null, 2))

  const { data: entries } = await supabase
    .from('financial_entries')
    .select('id, amount, status, source, is_clinic_discount, description')
    .eq('invoice_id', INVOICE_ID)
  console.log(`▶ ${entries?.length ?? 0} entries vinculados`)

  // 2) Apaga TODAS as entries vinculadas (cashier paid, pending, clinic_discount)
  if (entries && entries.length > 0) {
    const { error: delErr } = await supabase
      .from('financial_entries')
      .delete()
      .eq('invoice_id', INVOICE_ID)
    if (delErr) throw delErr
    console.log(`  ✓ ${entries.length} entries apagados`)
  }

  // 3) Apaga entries de central_cashier vinculados
  const { count: ccCount } = await supabase
    .from('central_cashier')
    .delete({ count: 'exact' })
    .eq('source_module', 'consultation')
    .eq('source_id', INVOICE_ID)
  console.log(`  ✓ ${ccCount ?? 0} entries do central_cashier removidos`)

  // 4) Reseta a invoice para pending (subtotal cheio, sem desconto, paid_amount=0)
  const { error: updErr } = await supabase
    .from('invoices')
    .update({
      discount:       0,
      total_amount:   inv.subtotal,  // volta o cheio (150)
      paid_amount:    0,
      status:         'pending',
      payment_method: null,
      paid_at:        null,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', INVOICE_ID)
  if (updErr) throw updErr
  console.log(`  ✓ invoice resetada: total=${inv.subtotal} · paid_amount=0 · status=pending`)

  // 5) Verifica
  const { data: after } = await supabase
    .from('invoices')
    .select('id, subtotal, total_amount, paid_amount, discount, status')
    .eq('id', INVOICE_ID)
    .single()
  console.log('\n✅ Estado final:', JSON.stringify(after, null, 2))
  console.log('\nA invoice agora aparece no caixa como pendente. Refaça a baixa com Aplicar Cobertura.')
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
