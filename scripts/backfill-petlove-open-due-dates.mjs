// Migra a due_date dos entries pendentes da remessa OPEN-202605 da Vet Teste
// de service_date para dia 30 do mês seguinte (calendário Petlove).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const SERVICE_KEY  = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function computePetloveDueDate(iso) {
  const [y, m] = iso.split('-').map(Number)
  const nextMonth = m === 12 ? 1 : m + 1
  const nextYear  = m === 12 ? y + 1 : y
  const lastDay = new Date(nextYear, nextMonth, 0).getDate()
  const day = Math.min(30, lastDay)
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Smoke test
const cases = [
  ['2026-05-15', '2026-06-30'],
  ['2026-05-31', '2026-06-30'],
  ['2026-05-02', '2026-06-30'],
  ['2026-01-10', '2026-02-28'],
  ['2026-12-20', '2027-01-30'],
]
console.log('▶ Smoke test computePetloveDueDate:')
for (const [input, expected] of cases) {
  const got = computePetloveDueDate(input)
  console.log(`  ${input} → ${got}  ${got === expected ? '✓' : `✗ esperado ${expected}`}`)
}

const VET_TESTE = '06fd6aca-0f80-45ac-a552-220af5a242ae'
const REM_NUMBER = 'OPEN-202605'

// Busca remessa
const { data: rem } = await supabase
  .from('petlove_remittances').select('id')
  .eq('clinic_id', VET_TESTE).eq('remittance_number', REM_NUMBER).single()
console.log(`\n▶ Remessa ${REM_NUMBER}: ${rem.id}`)

// Busca entries pendentes com a service_date da linha
const { data: entries } = await supabase
  .from('financial_entries')
  .select('id, amount, due_date, description, petlove_remittance_line_id, petlove_remittance_lines!inner(service_date)')
  .eq('clinic_id', VET_TESTE)
  .eq('source', 'petlove_open')
  .eq('status', 'pending')
console.log(`▶ ${entries.length} entries pendentes carregados`)

const dist = new Map()
for (const e of entries) {
  const svc = e.petlove_remittance_lines.service_date
  const newDue = computePetloveDueDate(svc)
  dist.set(newDue, (dist.get(newDue) ?? 0) + 1)
}
console.log('\n▶ Distribuição das novas due_dates:')
for (const [d, c] of dist) console.log(`  ${d}: ${c} entries`)

let updated = 0
for (const e of entries) {
  const svc = e.petlove_remittance_lines.service_date
  const newDue = computePetloveDueDate(svc)
  if (e.due_date === newDue) continue
  const { error } = await supabase
    .from('financial_entries')
    .update({ due_date: newDue, updated_at: new Date().toISOString() })
    .eq('id', e.id)
  if (error) { console.error(`  ✗ ${e.id}: ${error.message}`); continue }
  updated++
}
console.log(`\n✅ ${updated} entries migrados para a nova due_date.`)
