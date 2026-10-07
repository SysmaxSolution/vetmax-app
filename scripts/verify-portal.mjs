// Verificação E2E do Portal do Tutor — prova de ISOLAMENTO no nível HTTP.
// Uso: node scripts/verify-portal.mjs https://<deploy-url>
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

// 2 pets de tutores DIFERENTES, numa clínica que USA o Portal.
// O recorte por `portal_enabled` passou a ser necessário quando o Portal virou
// rotina opcional (achado F-1): num pet de clínica com a rotina desligada o
// `getTutorContext` some com o vínculo, e o 404 resultante seria lido como
// falha de isolamento quando na verdade é o gate funcionando.
const { data: enabled } = await admin.from('clinics').select('id, flow_config')
const enabledIds = (enabled ?? []).filter(c => (c.flow_config ?? {}).portal_enabled === true).map(c => c.id)
if (enabledIds.length === 0) { console.error('Nenhuma clínica com portal_enabled no dev.'); process.exit(1) }
const { data: pets } = await admin.from('patients').select('id, name, tutor_id, clinic_id')
  .in('clinic_id', enabledIds).is('deleted_at', null).limit(50)
const byTutor = {}
for (const p of pets ?? []) { if (!byTutor[p.tutor_id]) byTutor[p.tutor_id] = p }
const distinct = Object.values(byTutor)
if (distinct.length < 2) { console.error('Preciso de 2 pets de tutores diferentes no dev.'); process.exit(1) }
const mine = distinct[0]        // vou logar como tutor deste
const other = distinct.find(p => p.tutor_id !== mine.tutor_id)
console.log('Meu pet:', mine.name, '| tutor', mine.tutor_id)
console.log('Pet alheio:', other.name, '| tutor', other.tutor_id)

// cria identidade + vínculo SÓ com o meu tutor + sessão
const { data: tu } = await admin.from('tutor_users').insert({ full_name: '[VERIFY] Tutor', cpf: null, phone: null }).select('id').single()
await admin.from('tutor_user_links').insert({ tutor_user_id: tu.id, tutor_id: mine.tutor_id, clinic_id: mine.clinic_id, linked_via: 'self_cpf' })
const sessionToken = 'ts_' + randomBytes(32).toString('hex')
await admin.from('tutor_sessions').insert({ tutor_user_id: tu.id, session_token: sessionToken, expires_at: new Date(Date.now()+864e5).toISOString() })

const cookie = `sysvet_tutor=${sessionToken}`
async function get(path, follow = false) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie, 'user-agent': 'verify' }, redirect: follow ? 'follow' : 'manual' })
  return { status: r.status, html: await r.text() }
}

// 1) home lista MEU pet e NÃO o alheio.
// `/portal` agora é a porta de entrada SEM contexto: com um único vínculo ela
// redireciona para `/portal/c/<slug>` (white-label). Seguir o redirect é o que
// o navegador do tutor faz — a lista é aferida no destino.
const home = await get('/portal', true)
const homeOkMine = home.html.includes(mine.name)
const homeLeakOther = home.html.includes(other.name)
console.log(`\n/portal → HTTP ${home.status} | mostra meu pet: ${homeOkMine} | VAZA pet alheio: ${homeLeakOther}`)

// 2) detalhe do MEU pet → 200
const d1 = await get(`/portal/pet/${mine.id}`)
console.log(`/portal/pet/<meu> → HTTP ${d1.status} | contém meu pet: ${d1.html.includes(mine.name)}`)

// 3) detalhe do pet ALHEIO → bloqueado (notFound = 404)
const d2 = await get(`/portal/pet/${other.id}`)
const blocked = d2.status === 404 || !d2.html.includes(other.name)
console.log(`/portal/pet/<alheio> → HTTP ${d2.status} | bloqueado: ${blocked}`)

// 4) sem cookie → home pede login (não vaza)
const anon = await fetch(`${BASE}/portal`, { headers: { 'user-agent': 'verify' } })
const anonHtml = await anon.text()
const anonOk = anonHtml.includes('link') || anonHtml.includes('WhatsApp')
console.log(`/portal sem cookie → HTTP ${anon.status} | tela de login: ${anonOk} | vaza meu pet: ${anonHtml.includes(mine.name)}`)

const pass = homeOkMine && !homeLeakOther && d1.status === 200 && blocked && !anonHtml.includes(mine.name)
console.log(`\n${pass ? '✅ ISOLAMENTO OK' : '❌ FALHA DE ISOLAMENTO'}`)

// cleanup
await admin.from('tutor_sessions').delete().eq('tutor_user_id', tu.id)
await admin.from('tutor_user_links').delete().eq('tutor_user_id', tu.id)
await admin.from('tutor_users').delete().eq('id', tu.id)
console.log('(dados de teste removidos)')
process.exit(pass ? 0 : 1)
