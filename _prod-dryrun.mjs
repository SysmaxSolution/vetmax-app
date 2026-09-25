// SOMENTE LEITURA — dry-run de offboarding. Nenhuma escrita.
// Separa clínicas em MANTER (Animais*) vs REMOVER (resto) e conta o volume.
import { createRequire } from 'module'
const require = createRequire('C:/SysMax/package.json')
const dotenv = require('dotenv'); dotenv.config({ path: 'C:/SysMax/.env.local' })
const { createClient } = require('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const TABLES = ['tutors', 'patients', 'consultations', 'appointments', 'profiles', 'invoices', 'financial_entries', 'central_cashier', 'products']
async function cnt(table, clinicId) {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq('clinic_id', clinicId)
  if (error) return null
  return count ?? 0
}

const { data: clinics } = await db.from('clinics').select('id, name, status').order('name')
const keep = clinics.filter(c => /^animais/i.test(c.name.trim()))
const drop = clinics.filter(c => !/^animais/i.test(c.name.trim()))

console.log('===== MANTER (Animais*) =====')
for (const c of keep) console.log(`  ✓ ${c.name}  [${c.id}]`)
console.log(`\n===== REMOVER (${drop.length}) — volume por tabela =====`)
let grand = 0
for (const c of drop) {
  const parts = []
  let sub = 0
  for (const t of TABLES) { const n = await cnt(t, c.id); if (n !== null) { parts.push(`${t}=${n}`); sub += n } }
  grand += sub
  console.log(`  ✗ ${c.name} [${c.id.slice(0,8)}]  linhas≈${sub}  (${parts.filter(p=>!p.endsWith('=0')).join(', ') || 'vazia'})`)
}
console.log(`\nTOTAL de linhas a remover (tabelas amostradas) ≈ ${grand}`)
console.log(`Clínicas: manter=${keep.length}, remover=${drop.length}`)
