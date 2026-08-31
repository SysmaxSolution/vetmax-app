// Liga/lista a flag flow_config.animais_foundation nas clínicas do ambiente DEV.
// Uso: node scripts/animais-enable-flag.mjs            → lista clínicas + flag
//      node scripts/animais-enable-flag.mjs <clinic_id> → liga a flag naquela clínica
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// carrega .env.local manualmente
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const target = process.argv[2]

const { data: clinics, error } = await admin
  .from('clinics')
  .select('id, name, status, flow_config')
  .order('name')
if (error) { console.error(error); process.exit(1) }

if (!target) {
  console.log('Clínicas no DEV:\n')
  for (const c of clinics) {
    const on = (c.flow_config ?? {}).animais_foundation === true
    console.log(`${on ? '✅' : '⬜'} ${c.name}  [${c.status}]  ${c.id}`)
  }
  console.log('\nPara ligar: node scripts/animais-enable-flag.mjs <clinic_id>')
  process.exit(0)
}

const clinic = clinics.find(c => c.id === target)
if (!clinic) { console.error('Clínica não encontrada:', target); process.exit(1) }
const flow = { ...(clinic.flow_config ?? {}), animais_foundation: true }
const { error: upErr } = await admin.from('clinics').update({ flow_config: flow }).eq('id', target)
if (upErr) { console.error(upErr); process.exit(1) }
console.log(`✅ animais_foundation LIGADA em "${clinic.name}" (${target})`)
