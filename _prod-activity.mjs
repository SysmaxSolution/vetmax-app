// SOMENTE LEITURA. Lista clínicas de produção e mede atividade recente (14 dias).
// Nenhuma escrita/deleção. Uso: node _prod-activity.mjs
import { createRequire } from 'module'
const require = createRequire('C:/SysMax/package.json')
const dotenv = require('dotenv'); dotenv.config({ path: 'C:/SysMax/.env.local' })
const { createClient } = require('@supabase/supabase-js')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltam envs'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const now = Date.now()
const cutoff = new Date(now - 14 * 864e5).toISOString()

async function cnt(table, clinicId, col = 'created_at') {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq('clinic_id', clinicId).gte(col, cutoff)
  if (error) return `err(${error.code || error.message?.slice(0,20)})`
  return count ?? 0
}
async function maxDate(table, clinicId, col = 'created_at') {
  const { data, error } = await db.from(table).select(col).eq('clinic_id', clinicId).order(col, { ascending: false }).limit(1)
  if (error) return null
  return data && data[0] ? data[0][col] : null
}

const { data: clinics, error } = await db.from('clinics').select('id, name, status, created_at').order('created_at')
if (error) { console.error('erro clinics:', error.message); process.exit(1) }
console.log(`CLÍNICAS EM PRODUÇÃO: ${clinics.length}\n`)
for (const c of clinics) {
  const consult14 = await cnt('consultations', c.id)
  const appt14 = await cnt('appointments', c.id)
  const lastConsult = await maxDate('consultations', c.id)
  console.log(`• ${c.name}  [${c.id.slice(0,8)}]  status=${c.status}`)
  console.log(`    consultas(14d)=${consult14}  agendamentos(14d)=${appt14}  última_consulta=${lastConsult || '—'}`)
}
