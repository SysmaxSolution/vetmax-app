// Verificação de ISOLAMENTO POR FLAG — prova, no deploy real e com sessão de
// staff autenticada, que cada rotina nova do lote só existe para a clínica que
// a ativou em `clinics.flow_config`.
//
// Para CADA flag prova, com a flag DESLIGADA e depois LIGADA:
//   MENU       — o item aparece/some da navegação lateral
//   ROTA       — a URL direta entrega/nega a tela
//   SUPERFÍCIE — o painel/aba dentro da tela hospedeira aparece/some
//
// Método: cria uma CLÍNICA DE TESTE própria (`[QA] Isolamento de Rotinas`) com
// todos os módulos ativos E contratados (para o paywall de plano nunca mascarar
// o resultado do teste), um usuário admin descartável com senha aleatória, e um
// atendimento em fila de exame para as rotinas que vivem dentro do exame.
// Faz login real pelo @supabase/ssr — que gera os cookies exatamente como o app
// espera — e navega por HTTP. Ao final remove tudo. A clínica de demonstração
// (Sys Demo / ad1c3fca) NÃO é tocada.
//
// Nota de método: as rotas gateadas respondem HTTP 200 mesmo quando negam
// acesso, porque o `redirect()` acontece depois de o shell do Next ter sido
// enviado (streaming). Por isso a asserção é sobre o CONTEÚDO renderizado, não
// sobre o status HTTP — é o que o usuário realmente vê.
//
// Credenciais SEMPRE do .env.local — nada hardcoded.
// Uso: node scripts/verify-flag-isolation.mjs https://sysvetmax-dev.vercel.app

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes, randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const BASE = process.argv[2]
if (!BASE) { console.error('Uso: node scripts/verify-flag-isolation.mjs <url-base>'); process.exit(1) }

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !ANON || !SERVICE) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } })

let pass = 0, fail = 0
const ok    = (m) => { pass++; console.log('  OK    ' + m) }
const bad   = (m) => { fail++; console.log('  FALHA ' + m) }
const check = (cond, m) => (cond ? ok(m) : bad(m))

const ALL_MODULES = [
  'reception','patients','triage','consultation','exams','hospitalization','surgery',
  'grooming','registry','purchases','pharmacy','sales','cashier','financial','billing',
  'reports','internal_chat','whatsapp_intelligent','petlove_reconciliation',
]

const clinicId = randomUUID()
const email    = `qa-flag-isolation+${randomBytes(6).toString('hex')}@sysvetmax.test`
const password = randomBytes(24).toString('base64url')   // aleatória, descartada no fim
let userId = null, tutorId = null, patientId = null, consultationId = null
// fixtures dos portais públicos (tutor / parceiro) e do agente de laboratório
let tutorUserId = null, tutorSessionToken = null
let partnerClinicId = null, partnerSessionToken = null
let labAgentId = null, labAgentToken = null

// A limpeza passa por SQL direto: o gatilho de retenção CFMV (Res. 1321/2020)
// recusa apagar um atendimento com menos de 5 anos — correto em produção, mas
// deixaria resíduo de teste no dev. `session_replication_role = replica`
// suspende os gatilhos apenas nesta sessão, e só para as linhas de teste.
async function cleanup() {
  try {
    if (userId) { await admin.from('profiles').delete().eq('id', userId); await admin.auth.admin.deleteUser(userId) }
  } catch { /* segue para o SQL */ }
  const dbPass = process.env.SUPABASE_DEV_DB_PASSWORD
  const ref = (SUPA_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) ?? [])[1]
  if (!dbPass || !ref) { console.error('  (sem SUPABASE_DEV_DB_PASSWORD — limpeza incompleta, remova a clínica [QA] manualmente)'); return }
  const { default: pg } = await import('pg')
  const c = new pg.Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(dbPass)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  try {
    await c.connect()
    await c.query('SET session_replication_role = replica')
    if (tutorUserId) {
      await c.query('DELETE FROM tutor_sessions WHERE tutor_user_id=$1', [tutorUserId])
      await c.query('DELETE FROM tutor_user_links WHERE tutor_user_id=$1', [tutorUserId])
      await c.query('DELETE FROM tutor_users WHERE id=$1', [tutorUserId])
    }
    for (const t of ['partner_clinic_sessions','partner_clinics','lab_agents',
                     'consultations','patients','tutors','profiles',
                     'clinic_contracted_modules','tenant_subscriptions'])
      await c.query(`DELETE FROM ${t} WHERE clinic_id=$1`, [clinicId])
    await c.query('DELETE FROM clinics WHERE id=$1', [clinicId])
    await c.query('SET session_replication_role = origin')
  } catch (e) { console.error('  (limpeza parcial:', e.message, ')') }
  finally { try { await c.end() } catch { /* noop */ } }
}
process.on('uncaughtException', async (e) => { console.error(e); await cleanup(); process.exit(1) })
const die = async (msg) => { console.error(msg); await cleanup(); process.exit(1) }

// ── 1. fixtures ──────────────────────────────────────────────────────────────
console.log('Criando clínica de teste (flags TODAS desligadas)…')
{
  const { error } = await admin.from('clinics').insert({
    id: clinicId, name: '[QA] Isolamento de Rotinas', business_type: 'vet_clinic',
    active_modules: ALL_MODULES, status: 'active', flow_config: {},
  })
  if (error) await die('Não consegui criar a clínica: ' + error.message)
}
// ATENÇÃO: o trigger AFTER INSERT `trg_clinics_freemium_seed` reescreve
// `active_modules` com o pacote freemium. Por isso os módulos são gravados num
// UPDATE posterior — se forem só no INSERT, o teste roda com 3 módulos e as
// rotinas somem por falta de módulo, não por falta de flag (falso negativo).
await admin.from('clinics').update({ active_modules: ALL_MODULES }).eq('id', clinicId)
// Plano: a linha nasce pelo trigger trg_auto_provision_tenant — aqui promovemos
// e contratamos TODOS os módulos, para que um "acesso negado" observado adiante
// venha da FLAG e nunca do paywall de plano.
await admin.from('tenant_subscriptions')
  .update({ plan_name: 'enterprise', status: 'active', billing_cycle: 'monthly' }).eq('clinic_id', clinicId)
await admin.from('clinic_contracted_modules')
  .insert(ALL_MODULES.map((k) => ({ clinic_id: clinicId, module_key: k, is_active: true })))
{
  const { data: mods } = await admin.from('clinics').select('active_modules').eq('id', clinicId).single()
  if (!(mods?.active_modules ?? []).includes('exams')) await die('active_modules não persistiu — teste inválido.')
}

{
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: '[QA] Isolamento' },
  })
  if (error) await die('Não consegui criar o usuário: ' + error.message)
  userId = data.user.id
}
{
  const { error } = await admin.from('profiles')
    .upsert({ id: userId, full_name: '[QA] Isolamento', role: 'admin', clinic_id: clinicId, is_active: true })
  if (error) await die('Não consegui criar o profile: ' + error.message)
  const { data: chk } = await admin.from('profiles').select('clinic_id, is_sysmax').eq('id', userId).single()
  if (chk?.clinic_id !== clinicId) await die('Profile sem clinic_id — todas as rotas cairiam em /onboarding.')
  if (chk?.is_sysmax === true)     await die('Usuário de teste é SysMax — os gates seriam sempre abertos.')
}
// atendimento em fila de exame — hospedeiro das rotinas de Laboratório e Rejeição
{
  const { data: t } = await admin.from('tutors')
    .insert({ clinic_id: clinicId, name: '[QA] Tutor Isolamento' }).select('id').single()
  tutorId = t?.id
  const { data: p } = await admin.from('patients')
    .insert({ clinic_id: clinicId, tutor_id: tutorId, name: '[QA] Pet Isolamento', species: 'dog' }).select('id').single()
  patientId = p?.id
  const { data: k } = await admin.from('consultations')
    .insert({ clinic_id: clinicId, patient_id: patientId, status: 'waiting_exam', visit_reason: 'exam' }).select('id').single()
  consultationId = k?.id
  if (!consultationId) console.log('  (aviso: sem atendimento de exame — as rotinas de Laboratório/Rejeição não serão testadas na UI)')
}

// ── 2. login real; os cookies são gerados pelo próprio @supabase/ssr ─────────
const jar = new Map()
const ssr = createServerClient(SUPA_URL, ANON, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
  },
})
{
  const { error } = await ssr.auth.signInWithPassword({ email, password })
  if (error) await die('Login falhou: ' + error.message)
}
const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')
console.log(`Sessão de staff pronta (clínica de teste ${clinicId.slice(0, 8)}…)\n`)

async function setFlag(flag, on) {
  const { data } = await admin.from('clinics').select('flow_config').eq('id', clinicId).single()
  const next = { ...(data?.flow_config ?? {}) }
  if (on) next[flag] = true; else delete next[flag]
  await admin.from('clinics').update({ flow_config: next }).eq('id', clinicId)
}

const stripScripts = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, '')

async function page(path) {
  const bust = (path.includes('?') ? '&' : '?') + 'qa=' + randomBytes(4).toString('hex')
  const r = await fetch(`${BASE}${path}${bust}`, {
    headers: { cookie: cookieHeader, 'user-agent': 'verify-flag-isolation', 'cache-control': 'no-store' },
    redirect: 'manual',
  })
  const raw = r.status >= 300 && r.status < 400 ? '' : await r.text()
  const body = stripScripts(raw)
  return {
    status: r.status,
    body,
    // o gate pode negar por 3xx (antes do shell) ou por redirect de streaming (200 sem o conteúdo)
    paywalled: /Dispon[íi]vel no Plano|Módulo Premium/.test(body),
    shows: (re) => r.status === 200 && re.test(body),
  }
}

// ── 3. matriz de rotinas ────────────────────────────────────────────────────
const CASES = [
  { flag: 'portal_enabled', rotina: 'Portal do Tutor (caixa de mensagens)',
    menuLabel: 'Portal (Tutores)',
    route: { path: '/dashboard/portal-mensagens', marker: /Converse com os tutores/i } },

  { flag: 'usa_imagem', rotina: 'Módulo de Imagem / DICOM',
    menuLabel: 'Imagem',
    route: { path: '/dashboard/imaging', marker: /Nenhum estudo de imagem ainda|Solicitante/i } },

  { flag: 'usa_treinamento', rotina: 'Academia de Treinamento',
    menuLabel: 'Treinamento',
    route: { path: '/dashboard/treinamento', marker: /Academia SYSVETMAX|Conteúdo em preparação/i } },

  { flag: 'usa_convenios', rotina: 'Conciliação de convênios (Vetplan / AVA / Petlove)',
    route:   { path: '/dashboard/financial/insurance-reconciliation', marker: />\s*Conciliação de Convênios\s*</ },
    surface: { path: '/dashboard/financial', marker: /Conciliação de Convênios/ } },

  { flag: 'usa_boleto', rotina: 'Boletos Sicoob',
    surface: { path: '/dashboard/financial', marker: />\s*Boletos\s*</ } },

  { flag: 'usa_laboratorio', rotina: 'Laboratório (analitos / import HL7)',
    // o painel monta com um esqueleto ("Carregando resultados…") — é o que o SSR
    // entrega, e ele só existe quando a flag está ligada.
    surface: { path: () => `/dashboard/exams/${consultationId}`, marker: /Carregando resultados|Resultados do exame/ } },

  { flag: 'usa_fluxo_rejeicao_exame', rotina: 'Fluxo de rejeição de exame (painel no exame)',
    surface: { path: () => `/dashboard/exams/${consultationId}`, marker: /Carregando exames da OS|Realização dos exames/ } },
]

for (const c of CASES) {
  console.log(`\n── ${c.rotina}  ·  flow_config.${c.flag}`)
  const surfacePath = c.surface && (typeof c.surface.path === 'function' ? c.surface.path() : c.surface.path)
  if (c.surface && !surfacePath?.includes('undefined')) { /* ok */ }
  else if (c.surface) { console.log('  PULADO (sem fixture de atendimento)'); continue }

  for (const on of [false, true]) {
    await setFlag(c.flag, on)
    const estado = on ? 'LIGADA' : 'desligada'

    if (c.menuLabel) {
      const home = await page('/dashboard')
      const visible = home.body.includes(c.menuLabel)
      check(visible === on, `menu ${on ? 'mostra' : 'NÃO mostra'} "${c.menuLabel}" com a flag ${estado}`)
    }
    if (c.route) {
      const r = await page(c.route.path)
      if (r.paywalled) bad(`rota ${c.route.path} caiu no paywall de plano — teste inválido, não é o gate da flag`)
      else check(r.shows(c.route.marker) === on,
        `rota ${c.route.path} ${on ? 'entrega' : 'NÃO entrega'} a tela com a flag ${estado} (HTTP ${r.status})`)
    }
    if (c.surface) {
      const s = await page(surfacePath)
      if (s.paywalled) bad(`superfície em ${surfacePath} caiu no paywall de plano — teste inválido`)
      else check(s.shows(c.surface.marker) === on,
        `superfície em ${surfacePath} ${on ? 'presente' : 'ausente'} com a flag ${estado}`)
    }
  }
  await setFlag(c.flag, false)
}

// ── 4. flags sem superfície própria ─────────────────────────────────────────
console.log('\n── Recall de vacina  ·  flow_config.vaccine_recall_enabled')
// o cron seleciona exatamente com `.contains('flow_config', { vaccine_recall_enabled: true })`
const recallTargets = async () => {
  const { data } = await admin.from('clinics').select('id').contains('flow_config', { vaccine_recall_enabled: true })
  return (data ?? []).map((r) => r.id)
}
await setFlag('vaccine_recall_enabled', false)
check(!(await recallTargets()).includes(clinicId), 'clínica NÃO entra na seleção do cron com a flag desligada')
await setFlag('vaccine_recall_enabled', true)
check((await recallTargets()).includes(clinicId), 'clínica entra na seleção do cron com a flag ligada')
await setFlag('vaccine_recall_enabled', false)

console.log('\n── Políticas da recusa  ·  cancela_custo_lab_na_recusa / estorna_exame_faturado_na_recusa')
// leitura estrita (=== true): chave ausente nunca pode ser interpretada como ligada.
for (const flag of ['cancela_custo_lab_na_recusa', 'estorna_exame_faturado_na_recusa']) {
  await setFlag(flag, false)
  const offVal = ((await admin.from('clinics').select('flow_config').eq('id', clinicId).single()).data?.flow_config ?? {})[flag]
  await setFlag(flag, true)
  const onVal = ((await admin.from('clinics').select('flow_config').eq('id', clinicId).single()).data?.flow_config ?? {})[flag]
  check(offVal !== true && onVal === true, `${flag}: ausente ≠ ligada (off=${JSON.stringify(offVal)}, on=${JSON.stringify(onVal)})`)
  await setFlag(flag, false)
}
console.log('  (o efeito dessas duas políticas no caixa é coberto por scripts/verify-exam-rejection.mjs)')

// ── 5. Portais PÚBLICOS e API do agente — o caminho que NÃO passa pelo staff ──
// Achado F-1 do QA: uma clínica sem `portal_enabled` ainda entregava /portal a um
// tutor com sessão válida (HTTP 200 e o pet aparecendo). As seções abaixo provam
// o gate no caminho de SESSÃO — que é outro do caminho de menu/rota do staff.

// helper: requisição com cookie próprio do portal (sem a sessão de staff)
// `follow`: segue redirects, como faria o navegador. Necessário desde que
// `/portal` virou a porta de entrada SEM contexto de clínica — com um único
// vínculo ela redireciona para `/portal/c/<slug>`, onde a lista de pets mora.
async function publicPage(path, cookie, follow = false) {
  const bust = (path.includes('?') ? '&' : '?') + 'qa=' + randomBytes(4).toString('hex')
  const r = await fetch(`${BASE}${path}${bust}`, {
    headers: { cookie, 'user-agent': 'verify-flag-isolation', 'cache-control': 'no-store' },
    redirect: follow ? 'follow' : 'manual',
  })
  const body = r.status >= 300 && r.status < 400 ? '' : stripScripts(await r.text())
  return { status: r.status, body, shows: (re) => r.status === 200 && re.test(body) }
}

console.log('\n── Portal do Tutor (sessão do TUTOR)  ·  flow_config.portal_enabled')
if (!tutorId || !patientId) { console.log('  PULADO (sem fixture de tutor/pet)') }
else {
  const { data: tu } = await admin.from('tutor_users')
    .insert({ full_name: '[QA] Tutor Portal', phone: null, cpf: null }).select('id').single()
  tutorUserId = tu?.id ?? null
  if (!tutorUserId) bad('não consegui criar o tutor_user de teste')
  else {
    await admin.from('tutor_user_links').insert({
      tutor_user_id: tutorUserId, tutor_id: tutorId, clinic_id: clinicId, linked_via: 'qa_isolation',
    })
    tutorSessionToken = 'ts_' + randomBytes(32).toString('hex')
    await admin.from('tutor_sessions').insert({
      tutor_user_id: tutorUserId, session_token: tutorSessionToken,
      expires_at: new Date(Date.now() + 864e5).toISOString(),
    })
    const cookie = `sysvet_tutor=${tutorSessionToken}`
    for (const on of [false, true]) {
      await setFlag('portal_enabled', on)
      const p = await publicPage('/portal', cookie, true)
      const petVisivel = p.shows(/\[QA\] Pet Isolamento/)
      const msgIndisponivel = p.shows(/Área do Tutor indisponível/i)
      check(petVisivel === on,
        `/portal ${on ? 'MOSTRA' : 'NÃO mostra'} o pet com a flag ${on ? 'LIGADA' : 'desligada'} (HTTP ${p.status})`)
      if (!on) check(msgIndisponivel, '/portal explica ao tutor que a área está indisponível (sem vazar dados)')
      // a sessão continua válida: o gate é da ROTINA, não um logout disfarçado
      if (!on) {
        const { data: s } = await admin.from('tutor_sessions')
          .select('revoked_at').eq('session_token', tutorSessionToken).maybeSingle()
        check(s?.revoked_at == null, 'a sessão do tutor NÃO é revogada pelo gate (GET não faz mutação destrutiva)')
      }
    }
    await setFlag('portal_enabled', false)
  }
}

console.log('\n── Portal do Parceiro (sessão do VETERINÁRIO solicitante)  ·  flow_config.partner_portal_enabled')
{
  const { data: pc } = await admin.from('partner_clinics')
    .insert({ clinic_id: clinicId, name: '[QA] Parceira Isolamento' }).select('id').single()
  partnerClinicId = pc?.id ?? null
  if (!partnerClinicId) { console.log('  PULADO (não consegui criar a clínica parceira)') }
  else {
    partnerSessionToken = 'ps_' + randomBytes(32).toString('hex')
    const { error: se } = await admin.from('partner_clinic_sessions').insert({
      kind: 'admin', partner_clinic_id: partnerClinicId, professional_id: null,
      clinic_id: clinicId, session_token: partnerSessionToken,
      expires_at: new Date(Date.now() + 864e5).toISOString(),
    })
    if (se) { bad('não consegui criar a sessão do parceiro: ' + se.message) }
    else {
      const cookie = `sysvet_parceiro=${partnerSessionToken}`
      for (const on of [false, true]) {
        await setFlag('partner_portal_enabled', on)
        const p = await publicPage('/parceiro', cookie)
        const entrega = p.shows(/Pets encaminhados/i)
        check(entrega === on,
          `/parceiro ${on ? 'entrega' : 'NÃO entrega'} a área do parceiro com a flag ${on ? 'LIGADA' : 'desligada'} (HTTP ${p.status})`)
        if (!on) check(p.shows(/Portal do Veterinário indisponível/i),
          '/parceiro explica ao veterinário que o portal está indisponível')
      }
      await setFlag('partner_portal_enabled', false)
    }
  }
}

console.log('\n── API do agente de laboratório  ·  flow_config.usa_laboratorio')
{
  labAgentToken = 'la_' + randomBytes(24).toString('hex')
  const { data: ag, error: ae } = await admin.from('lab_agents')
    .insert({ clinic_id: clinicId, token: labAgentToken, label: '[QA] Agente Isolamento', is_active: true })
    .select('id').single()
  labAgentId = ag?.id ?? null
  if (ae || !labAgentId) { console.log('  PULADO (não consegui criar o lab_agent: ' + (ae?.message ?? '?') + ')') }
  else {
    for (const on of [false, true]) {
      await setFlag('usa_laboratorio', on)
      const r = await fetch(`${BASE}/api/lab/ping?env=qa&t=${randomBytes(3).toString('hex')}`, {
        headers: { authorization: `Bearer ${labAgentToken}`, 'cache-control': 'no-store' },
      })
      check((r.status === 200) === on,
        `/api/lab/ping responde ${on ? '200' : '401'} com a flag ${on ? 'LIGADA' : 'desligada'} (HTTP ${r.status})`)
    }
    await setFlag('usa_laboratorio', false)
    // token errado continua 401 mesmo com a rotina ligada (não é o gate que autentica)
    await setFlag('usa_laboratorio', true)
    const r = await fetch(`${BASE}/api/lab/ping?t=${randomBytes(3).toString('hex')}`, {
      headers: { authorization: 'Bearer la_token_que_nao_existe', 'cache-control': 'no-store' },
    })
    check(r.status === 401, `token inválido continua 401 com a rotina ligada (HTTP ${r.status})`)
    await setFlag('usa_laboratorio', false)
  }
}

// ── 6. resultado ────────────────────────────────────────────────────────────
await cleanup()
console.log(`\n${pass} verificações OK · ${fail} falhas`)
process.exit(fail === 0 ? 0 : 1)
