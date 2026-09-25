// Inspeciona o estado atual da clínica Vet Teste após a tentativa de import.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const SERVICE_KEY  = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const VET_TESTE = '06fd6aca-0f80-45ac-a552-220af5a242ae'

// 1) Remessas Petlove recentes
const { data: rems } = await supabase
  .from('petlove_remittances')
  .select('id, remittance_number, status, is_preview, source_format, total_gross_value, period_start, period_end, imported_at')
  .eq('clinic_id', VET_TESTE)
  .order('imported_at', { ascending: false })
  .limit(10)

console.log('═══ Remessas Petlove (top 10) ═══')
for (const r of rems ?? []) {
  console.log(`  ${r.imported_at.slice(0, 19)} · ${r.remittance_number.padEnd(15)} · ${r.status.padEnd(11)} · preview=${r.is_preview} fmt=${r.source_format} · ${r.period_start}→${r.period_end} · R$ ${r.total_gross_value}`)
}

// 2) financial_entries Petlove criados hoje
const today = new Date().toISOString().slice(0, 10)
const { data: fe } = await supabase
  .from('financial_entries')
  .select('id, source, status, amount, description, payment_date, due_date, created_at, petlove_remittance_line_id')
  .eq('clinic_id', VET_TESTE)
  .in('source', ['petlove', 'petlove_open', 'petlove_indicacao'])
  .gte('created_at', today + 'T00:00:00')
  .order('created_at', { ascending: false })
  .limit(500)

const bySource = new Map()
let totalPending = 0, totalPaid = 0
for (const f of fe ?? []) {
  const k = `${f.source}|${f.status}`
  const cur = bySource.get(k) ?? { count: 0, amount: 0 }
  cur.count++
  cur.amount += Number(f.amount)
  bySource.set(k, cur)
  if (f.status === 'pending') totalPending += Number(f.amount)
  if (f.status === 'paid')    totalPaid    += Number(f.amount)
}

console.log('\n═══ financial_entries Petlove criados hoje ═══')
for (const [k, v] of bySource.entries()) {
  console.log(`  ${k.padEnd(28)} → ${String(v.count).padStart(4)} entries · R$ ${v.amount.toFixed(2)}`)
}
console.log(`\n  TOTAL pending: R$ ${totalPending.toFixed(2)}`)
console.log(`  TOTAL paid:    R$ ${totalPaid.toFixed(2)}`)

// 3) Entries linkados a linhas de remessas open
const openRems = (rems ?? []).filter(r => r.is_preview)
if (openRems.length > 0) {
  console.log('\n═══ Entries vinculados às remessas OPEN ═══')
  for (const r of openRems) {
    const { data: linkedLines } = await supabase
      .from('petlove_remittance_lines')
      .select('id')
      .eq('remittance_id', r.id)
    const ids = (linkedLines ?? []).map(l => l.id)
    if (ids.length === 0) {
      console.log(`  ${r.remittance_number}: sem linhas`)
      continue
    }
    const { data: linkedFe } = await supabase
      .from('financial_entries')
      .select('id, status, source')
      .in('petlove_remittance_line_id', ids)
    const counts = {}
    for (const f of linkedFe ?? []) {
      const k = `${f.source}/${f.status}`
      counts[k] = (counts[k] ?? 0) + 1
    }
    console.log(`  ${r.remittance_number} (${ids.length} linhas) → ${JSON.stringify(counts)}`)
  }
}
