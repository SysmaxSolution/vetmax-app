// Verificação E2E do agendamento pelo portal — a CONFIG da clínica muda a tela.
// Uso: node scripts/verify-booking.mjs https://<deploy-url>
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })
const BASE = process.argv[2]
if (!BASE) { console.error('Informe a URL base.'); process.exit(1) }
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: pet } = await admin.from('patients').select('id, name, tutor_id, clinic_id').is('deleted_at', null).limit(1).single()
console.log('Pet:', pet.name, '| clinic', pet.clinic_id)

// sessão do tutor
const { data: tu } = await admin.from('tutor_users').insert({ full_name: '[VERIFY] Booking' }).select('id').single()
await admin.from('tutor_user_links').insert({ tutor_user_id: tu.id, tutor_id: pet.tutor_id, clinic_id: pet.clinic_id, linked_via: 'self_cpf' })
const sessionToken = 'ts_' + randomBytes(32).toString('hex')
await admin.from('tutor_sessions').insert({ tutor_user_id: tu.id, session_token: sessionToken, expires_at: new Date(Date.now()+864e5).toISOString() })
const cookie = `sysvet_tutor=${sessionToken}`

// guarda config original p/ restaurar
const { data: clinicBefore } = await admin.from('clinics').select('flow_config').eq('id', pet.clinic_id).single()
const original = clinicBefore?.flow_config ?? {}

async function setMode(mode) {
  await admin.from('clinics').update({ flow_config: { ...original, portal_enabled: mode !== 'off-portal', booking_mode_portal: mode === 'off-portal' ? 'reception' : mode } }).eq('id', pet.clinic_id)
}
async function fetchAgendar() {
  const r = await fetch(`${BASE}/portal/pet/${pet.id}/agendar`, { headers: { cookie, 'user-agent': 'verify' } })
  return await r.text()
}

let pass = true
// off-portal: portal desligado → indisponível
await setMode('off-portal')
let h = await fetchAgendar()
const offOk = h.includes('indispon') || h.includes('não habilitou')
console.log('portal OFF →', offOk ? 'indisponível ✓' : 'FALHOU ✗'); pass = pass && offOk

// reception
await admin.from('clinics').update({ flow_config: { ...original, portal_enabled: true, booking_mode_portal: 'reception' } }).eq('id', pet.clinic_id)
h = await fetchAgendar()
const recOk = h.includes('recepção confirma') || h.includes('preferência')
console.log('portal RECEPTION →', recOk ? 'form de solicitação ✓' : 'FALHOU ✗'); pass = pass && recOk

// direct
await admin.from('clinics').update({ flow_config: { ...original, portal_enabled: true, booking_mode_portal: 'direct' } }).eq('id', pet.clinic_id)
h = await fetchAgendar()
const dirOk = h.includes('Horários livres') || h.includes('Confirmar agendamento')
console.log('portal DIRECT →', dirOk ? 'form de horários livres ✓' : 'FALHOU ✗'); pass = pass && dirOk

// restaura + limpa
await admin.from('clinics').update({ flow_config: original }).eq('id', pet.clinic_id)
await admin.from('tutor_sessions').delete().eq('tutor_user_id', tu.id)
await admin.from('tutor_user_links').delete().eq('tutor_user_id', tu.id)
await admin.from('tutor_users').delete().eq('id', tu.id)

console.log(`\n${pass ? '✅ CONFIG→UI OK' : '❌ FALHA'}`)
console.log('(config restaurada, dados de teste removidos)')
process.exit(pass ? 0 : 1)
