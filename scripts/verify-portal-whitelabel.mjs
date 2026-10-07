// Verificação E2E do WHITE-LABEL do Portal do Tutor, no deploy real e com
// SESSÃO DE TUTOR de verdade (cookie sysvet_tutor).
//
// Prova, em ordem:
//   (a) tutor de UMA clínica vê a marca dela (nome, cores, fonte) — e o link
//       antigo `/portal` o leva sozinho para `/portal/c/<slug>`;
//   (b) tutor de DUAS clínicas vê a marca CERTA em cada contexto e SÓ os pets
//       daquela clínica;
//   (c) contexto de clínica NÃO vinculada é recusado, e recusado igual a um
//       slug inexistente (a URL não serve de oráculo);
//   (d) o link antigo `/portal/pet/<id>` continua funcionando — e agora já
//       aparece com a marca da clínica dona do pet.
//
// Método: cria 3 clínicas de teste próprias ([QA] WL …), cada uma com um tema
// distinto e inconfundível, pets próprios, e duas identidades de tutor (uma
// mono-clínica, uma multi-clínica). Navega por HTTP e afere o HTML renderizado.
// Ao final, remove tudo. Nenhuma clínica real é tocada.
//
// Credenciais SEMPRE do .env.local — nada hardcoded.
// Uso: node scripts/verify-portal-whitelabel.mjs https://sysvetmax-dev.vercel.app

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes, randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const BASE = process.argv[2]
if (!BASE) { console.error('Uso: node scripts/verify-portal-whitelabel.mjs <url-base>'); process.exit(1) }

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SERVICE) { console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local'); process.exit(1) }
const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } })

let pass = 0, fail = 0
const ok    = (m) => { pass++; console.log('  OK    ' + m) }
const bad   = (m) => { fail++; console.log('  FALHA ' + m) }
const check = (cond, m) => (cond ? ok(m) : bad(m))

const tag = randomBytes(3).toString('hex')

// Três clínicas com identidades INCONFUNDÍVEIS entre si.
const CLINICS = [
  {
    id: randomUUID(), key: 'A',
    name: `[QA] WL Animais ${tag}`, slug: `qa-wl-animais-${tag}`,
    // Propositalmente LONGE do padrão verde-pinho/dourado: se a tela aparecer
    // com a paleta antiga, a verificação falha em vez de passar por engano.
    theme: { primary_color: '#8C2D3F', primary_dark_color: '#5A1526', accent_color: '#E8B4BC',
             bg_color: '#FDF7F8', heading_font: 'dm-serif', tagline: 'Cuidado de sempre' },
  },
  {
    id: randomUUID(), key: 'B',
    name: `[QA] WL Bichos ${tag}`, slug: `qa-wl-bichos-${tag}`,
    theme: { primary_color: '#1B4D9B', primary_dark_color: '#0B2C5E', accent_color: '#E4572E',
             bg_color: '#F2F6FC', heading_font: 'playfair', tagline: 'Portal Bichos' },
  },
  {
    id: randomUUID(), key: 'X',   // existe, mas NINGUÉM do teste é tutor nela
    name: `[QA] WL Alheia ${tag}`, slug: `qa-wl-alheia-${tag}`,
    theme: { primary_color: '#6B21A8', primary_dark_color: '#3B0764', accent_color: '#FACC15',
             bg_color: '#FAF5FF', heading_font: 'lora', tagline: 'Nao deveria aparecer' },
  },
]
const byKey = Object.fromEntries(CLINICS.map(c => [c.key, c]))

const fixtures = { tutors: {}, pets: {}, tutorUsers: [], sessions: [] }

async function cleanup() {
  const dbPass = process.env.SUPABASE_DEV_DB_PASSWORD
  const ref = (SUPA_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) ?? [])[1]
  if (!dbPass || !ref) { console.error('  (sem SUPABASE_DEV_DB_PASSWORD — remova as clínicas [QA] WL manualmente)'); return }
  const { default: pg } = await import('pg')
  const c = new pg.Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(dbPass)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  try {
    await c.connect()
    await c.query('SET session_replication_role = replica')
    for (const tu of fixtures.tutorUsers) {
      await c.query('DELETE FROM tutor_sessions WHERE tutor_user_id=$1', [tu])
      await c.query('DELETE FROM tutor_user_links WHERE tutor_user_id=$1', [tu])
      await c.query('DELETE FROM tutor_users WHERE id=$1', [tu])
    }
    for (const cl of CLINICS) {
      for (const t of ['clinic_portal_themes', 'consultations', 'patients', 'tutors',
                       'clinic_contracted_modules', 'tenant_subscriptions'])
        await c.query(`DELETE FROM ${t} WHERE clinic_id=$1`, [cl.id])
      await c.query('DELETE FROM clinics WHERE id=$1', [cl.id])
    }
    await c.query('SET session_replication_role = origin')
  } catch (e) { console.error('  (limpeza parcial:', e.message, ')') }
  finally { try { await c.end() } catch { /* noop */ } }
}
process.on('uncaughtException', async (e) => { console.error(e); await cleanup(); process.exit(1) })
const die = async (msg) => { console.error('ABORT: ' + msg); await cleanup(); process.exit(1) }

// ── 1. fixtures ──────────────────────────────────────────────────────────────
console.log('Criando 3 clínicas de teste, cada uma com a sua identidade…')
for (const cl of CLINICS) {
  const { error } = await admin.from('clinics').insert({
    id: cl.id, name: cl.name, business_type: 'vet_clinic', status: 'active',
    portal_slug: cl.slug,
    // A rotina do Portal precisa estar LIGADA, senão getTutorContext some com os
    // vínculos e o teste mediria o gate de rotina, não o white-label.
    flow_config: { portal_enabled: true },
  })
  if (error) await die(`clínica ${cl.key}: ${error.message}`)
  // O trigger freemium pode reescrever colunas do INSERT — reafirma slug e flag.
  await admin.from('clinics')
    .update({ portal_slug: cl.slug, flow_config: { portal_enabled: true } }).eq('id', cl.id)

  const { error: te } = await admin.from('clinic_portal_themes').upsert({ clinic_id: cl.id, ...cl.theme })
  if (te) await die(`tema ${cl.key}: ${te.message}`)

  const { data: t } = await admin.from('tutors')
    .insert({ clinic_id: cl.id, name: `[QA] Tutor ${cl.key} ${tag}` }).select('id').single()
  if (!t) await die(`tutor ${cl.key} não criado`)
  fixtures.tutors[cl.key] = t.id

  const { data: p } = await admin.from('patients')
    .insert({ clinic_id: cl.id, tutor_id: t.id, name: `PetDa${cl.key}${tag}`, species: 'dog' })
    .select('id').single()
  if (!p) await die(`pet ${cl.key} não criado`)
  fixtures.pets[cl.key] = { id: p.id, name: `PetDa${cl.key}${tag}` }
}
{
  const { data: chk } = await admin.from('clinics').select('id, portal_slug, flow_config').in('id', CLINICS.map(c => c.id))
  for (const cl of CLINICS) {
    const row = (chk ?? []).find(r => r.id === cl.id)
    if (row?.portal_slug !== cl.slug) await die(`slug da clínica ${cl.key} não persistiu`)
    if (row?.flow_config?.portal_enabled !== true) await die(`portal_enabled da clínica ${cl.key} não persistiu`)
  }
}

// Identidade MONO: tutora só na clínica A.
// Identidade MULTI: a MESMA pessoa é tutora na A e na B (o caso do Diretor).
async function makeTutorUser(label, links) {
  const { data: tu } = await admin.from('tutor_users')
    .insert({ full_name: label, cpf: null, phone: null }).select('id').single()
  if (!tu) await die(`tutor_user ${label} não criado`)
  fixtures.tutorUsers.push(tu.id)
  for (const k of links) {
    const { error } = await admin.from('tutor_user_links').insert({
      tutor_user_id: tu.id, tutor_id: fixtures.tutors[k], clinic_id: byKey[k].id, linked_via: 'self_cpf',
    })
    if (error) await die(`vínculo ${label}/${k}: ${error.message}`)
  }
  const token = 'ts_' + randomBytes(32).toString('hex')
  await admin.from('tutor_sessions').insert({
    tutor_user_id: tu.id, session_token: token,
    expires_at: new Date(Date.now() + 864e5).toISOString(),
  })
  return token
}
const monoCookie  = `sysvet_tutor=${await makeTutorUser(`[QA] Mono ${tag}`,  ['A'])}`
const multiCookie = `sysvet_tutor=${await makeTutorUser(`[QA] Multi ${tag}`, ['A', 'B'])}`
console.log(`Fixtures prontas (tag ${tag}).\n`)

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function get(path, cookie, { follow = false } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { cookie, 'user-agent': 'verify-whitelabel' },
    redirect: follow ? 'follow' : 'manual',
  })
  return { status: r.status, location: r.headers.get('location'), url: r.url, html: await r.text() }
}
/** A marca aparece na página? (nome + cor primária escura + fonte do tema) */
function wears(html, cl) {
  return html.includes(cl.name)
      && html.includes(cl.theme.primary_dark_color)
      && html.includes(cl.theme.accent_color)
}

const A = byKey.A, B = byKey.B, X = byKey.X

// ── (a) tutor de UMA clínica ─────────────────────────────────────────────────
console.log('(a) Tutor de UMA clínica vê a marca dela')
{
  const root = await get('/portal', monoCookie)
  check(root.status === 307 || root.status === 302,
        `/portal redireciona (HTTP ${root.status})`)
  check((root.location ?? '').includes(`/portal/c/${A.slug}`),
        `redireciona para o contexto da clínica → ${root.location ?? '(sem Location)'}`)

  const home = await get(`/portal/c/${A.slug}`, monoCookie)
  check(home.status === 200, `/portal/c/<slug> responde 200 (HTTP ${home.status})`)
  check(wears(home.html, A), 'a página veste a marca da clínica A (nome + cores do tema)')
  check(home.html.includes(A.theme.tagline), 'a frase configurada pela clínica aparece no herói')
  check(home.html.includes(fixtures.pets.A.name), 'o pet da clínica A é listado')
  check(!home.html.includes(B.theme.primary_dark_color), 'nenhuma cor da clínica B vaza para a tela da A')
}

// ── (b) tutor de DUAS clínicas: marca certa em cada contexto ────────────────
console.log('\n(b) Tutor de DUAS clínicas — identidade e pets por contexto')
{
  const selector = await get('/portal', multiCookie)
  check(selector.status === 200, `/portal mostra o SELETOR em vez de redirecionar (HTTP ${selector.status})`)
  check(selector.html.includes(A.name) && selector.html.includes(B.name),
        'o seletor lista as duas clínicas')
  check(!selector.html.includes(X.name), 'o seletor NÃO lista a clínica não vinculada')

  const inA = await get(`/portal/c/${A.slug}`, multiCookie)
  check(inA.status === 200 && wears(inA.html, A), 'no contexto da A, veste a marca da A')
  check(inA.html.includes(fixtures.pets.A.name), 'no contexto da A, o pet da A aparece')
  check(!inA.html.includes(fixtures.pets.B.name), 'PROVA: no contexto da A, o pet da B NÃO aparece')
  check(!inA.html.includes(B.theme.primary_dark_color), 'no contexto da A, a cor da B não vaza')

  const inB = await get(`/portal/c/${B.slug}`, multiCookie)
  check(inB.status === 200 && wears(inB.html, B), 'no contexto da B, veste a marca da B (outra paleta e outra fonte)')
  check(inB.html.includes(fixtures.pets.B.name), 'no contexto da B, o pet da B aparece')
  check(!inB.html.includes(fixtures.pets.A.name), 'PROVA: no contexto da B, o pet da A NÃO aparece')
  check(inB.html.includes('--font-pt-playfair') || inB.html.includes('Playfair'),
        'a fonte de título da B é a que ela escolheu, não a padrão')
}

// ── (c) contexto de clínica NÃO vinculada é recusado ────────────────────────
console.log('\n(c) Contexto de clínica não vinculada')
{
  const forced = await get(`/portal/c/${X.slug}`, multiCookie)
  check(!forced.html.includes(fixtures.pets.X.name), 'PROVA: nenhum pet da clínica alheia é servido')
  check(!forced.html.includes(X.theme.primary_dark_color), 'PROVA: nem a identidade visual dela é revelada')
  check(!forced.html.includes(X.name), 'PROVA: nem o nome dela é revelado')
  check(forced.html.includes('não está disponível') || forced.html.includes('nao esta disponivel'),
        'a tela recusa com a mensagem genérica')

  const ghost = await get(`/portal/c/qa-wl-inexistente-${tag}`, multiCookie)
  const norm = (h) => h.replace(/qa-wl-[a-z0-9-]+/g, '<slug>').replace(/\s+/g, ' ')
  check(norm(ghost.html).length > 0 && norm(forced.html) === norm(ghost.html),
        'PROVA: clínica alheia e clínica inexistente respondem IGUAL (a URL não é oráculo)')

  const anon = await get(`/portal/c/${A.slug}`, '')
  check(!anon.html.includes(fixtures.pets.A.name), 'sem cookie, o contexto não serve pet nenhum')
}

// ── (d) links antigos continuam funcionando ─────────────────────────────────
console.log('\n(d) Retrocompatibilidade dos links já enviados aos tutores')
{
  const petA = await get(`/portal/pet/${fixtures.pets.A.id}`, multiCookie)
  check(petA.status === 200, `/portal/pet/<id> (link antigo) responde 200 (HTTP ${petA.status})`)
  check(petA.html.includes(fixtures.pets.A.name), 'o link antigo entrega o pet')
  check(wears(petA.html, A), 'BÔNUS: o link antigo já aparece com a marca da clínica dona do pet')
  check(petA.html.includes(`/portal/c/${A.slug}`), 'o "voltar" leva ao contexto da clínica certa')

  const petB = await get(`/portal/pet/${fixtures.pets.B.id}`, multiCookie)
  check(petB.status === 200 && wears(petB.html, B),
        'o pet da B, pelo link antigo, aparece com a marca da B')

  const petX = await get(`/portal/pet/${fixtures.pets.X.id}`, multiCookie)
  const blocked = petX.status === 404 || !petX.html.includes(fixtures.pets.X.name)
  check(blocked, `PROVA: pet de clínica não vinculada continua bloqueado (HTTP ${petX.status})`)
  check(!petX.html.includes(X.theme.primary_dark_color), 'e a marca dela também não vaza pelo link antigo')

  const anon = await fetch(`${BASE}/portal`, { headers: { 'user-agent': 'verify-whitelabel' } })
  const anonHtml = await anon.text()
  check(!anonHtml.includes(fixtures.pets.A.name), '/portal sem cookie não vaza pet')
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} verificações OK, ${fail} falha(s).`)
await cleanup()
console.log('(dados de teste removidos)')
process.exit(fail === 0 ? 0 : 1)
