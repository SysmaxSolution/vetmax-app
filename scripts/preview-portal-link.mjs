// Gera um link de PRÉ-VISUALIZAÇÃO do Portal do Tutor (sessão de 7 dias) para um
// tutor com pets. Uso: node scripts/preview-portal-link.mjs https://<deploy-url> [clinicId]
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })
const BASE = process.argv[2] ?? 'https://sysvetmax-dev.vercel.app'
const CLINIC = process.argv[3] ?? 'ad1c3fca-d264-42c3-9a11-4b7ddac52a72' // Animais (dev)
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// escolhe um tutor da clínica que tenha MAIS de um pet (mais rico p/ demo), senão qualquer um
const { data: pets } = await admin.from('patients').select('id, name, tutor_id').eq('clinic_id', CLINIC).is('deleted_at', null).limit(200)
const count = {}
for (const p of pets ?? []) count[p.tutor_id] = (count[p.tutor_id] ?? 0) + 1
const tutorId = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0]
if (!tutorId) { console.error('Sem pets na clínica.'); process.exit(1) }
const { data: tutor } = await admin.from('tutors').select('name, cpf, phone').eq('id', tutorId).single()
const myPets = (pets ?? []).filter(p => p.tutor_id === tutorId).map(p => p.name)

// identidade de portal + vínculo + token de login de 7 dias (preview)
const { data: tu } = await admin.from('tutor_users').insert({ full_name: tutor?.name ?? 'Tutor (preview)', cpf: null, phone: null }).select('id').single()
await admin.from('tutor_user_links').insert({ tutor_user_id: tu.id, tutor_id: tutorId, clinic_id: CLINIC, linked_via: 'reception_invite' })
const token = 'tl_' + randomBytes(24).toString('hex')
await admin.from('tutor_login_tokens').insert({ tutor_user_id: tu.id, clinic_id: CLINIC, token, expires_at: new Date(Date.now() + 7 * 864e5).toISOString() })

console.log('Tutor demo :', tutor?.name)
console.log('Pets       :', myPets.join(', '))
console.log('\n🔗 LINK DE PRÉVIA (abra no navegador, válido 7 dias):')
console.log(`${BASE}/portal/entrar?t=${token}`)
