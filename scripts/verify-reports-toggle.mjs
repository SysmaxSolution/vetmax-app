// Prova de ponta a ponta de que a CONFIGURAÇÃO DE RELATÓRIOS persiste.
//
// O bug (medido em 24/09/2026): `saveReportsEnabled`/`getReportsEnabled`
// (src/lib/actions/reports-g13.ts) gravam e leem `clinic_settings.reports_enabled`,
// coluna que NUNCA foi criada por migration. O upsert devolvia PGRST204 e o select
// caía no REPORTS_DEFAULTS (tudo `true`) — o administrador não conseguia desligar
// relatório nenhum, apesar do ALWAYS_ON já ter sido removido do código (123d80b0).
//
// Este script prova, no BANCO e pelo MESMO caminho do app (PostgREST + service
// role, igual ao `createAdminClient()` das actions):
//   1. a coluna existe (DDL da migration 0475);
//   2. o CONTROLE negativo: uma coluna inexistente devolve PGRST204 — é a forma
//      exata do erro que a tela dava ANTES da 0475;
//   3. desligar um relatório PERSISTE (upsert → select devolve `false`);
//   4. com esse valor, a regra de visibilidade esconde o relatório;
//   5. religar PERSISTE e o relatório volta;
//   6. clínica sem linha/NULL continua com todos os relatórios ligados.
//
// As regras de leitura replicadas aqui (passos 4 e 6) são as de
// `getReportsEnabled` (`raw[k] ?? true`) e `isReportVisible`
// (`enabled?.[key] === false` esconde) — a lógica pura em si é coberta por
// tests/unit/reports-visibility.test.ts. Aqui o que se prova é a PERSISTÊNCIA.
//
// Roda numa clínica de teste descartável — nenhuma clínica real é tocada.
// Credenciais SEMPRE do .env.local. Uso: node scripts/verify-reports-toggle.mjs

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY
const DB_PASS  = process.env.SUPABASE_DEV_DB_PASSWORD
if (!SUPA_URL || !SERVICE) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local'); process.exit(1)
}
const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } })

let pass = 0, fail = 0
const ok  = (m) => { pass++; console.log('  OK    ' + m) }
const bad = (m) => { fail++; console.log('  FALHA ' + m) }
const check = (cond, m) => (cond ? ok(m) : bad(m))

const clinicId = randomUUID()

async function cleanup() {
  try {
    await admin.from('clinic_settings').delete().eq('clinic_id', clinicId)
    await admin.from('clinics').delete().eq('id', clinicId)
  } catch { /* best-effort */ }
}
process.on('uncaughtException', async (e) => { console.error(e); await cleanup(); process.exit(1) })

// ── 1. a coluna existe (DDL) ────────────────────────────────────────────────
console.log('\n── 1. DDL — clinic_settings.reports_enabled')
if (!DB_PASS) {
  console.log('  (sem SUPABASE_DEV_DB_PASSWORD — pulo a checagem de DDL; os passos seguintes já provam via PostgREST)')
} else {
  const ref = (SUPA_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) ?? [])[1]
  const { default: pg } = await import('pg')
  const c = new pg.Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(DB_PASS)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const r = await c.query(
    `SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='clinic_settings' AND column_name='reports_enabled'`)
  check(r.rows.length === 1 && r.rows[0].data_type === 'jsonb', `coluna existe e é jsonb (${r.rows[0]?.data_type ?? 'AUSENTE'})`)
  check(r.rows[0]?.is_nullable === 'YES', 'coluna é NULLABLE (NULL = usa os padrões)')
  await c.end()
}

// ── fixture ─────────────────────────────────────────────────────────────────
{
  const { error } = await admin.from('clinics').insert({
    id: clinicId, name: '[QA] Toggle de Relatórios', business_type: 'vet_clinic', status: 'active',
  })
  if (error) { console.error('Não consegui criar a clínica de teste: ' + error.message); process.exit(1) }
}

// ── 2. controle negativo — é assim que a tela falhava ANTES da 0475 ─────────
console.log('\n── 2. Controle negativo (a forma do erro de antes)')
{
  const { error } = await admin.from('clinic_settings')
    .upsert({ clinic_id: clinicId, reports_enabled_inexistente: {} }, { onConflict: 'clinic_id' })
  check(!!error && /PGRST204|column|schema cache/i.test(`${error.code} ${error.message}`),
    `coluna inexistente é recusada pelo PostgREST: ${error ? `${error.code} — ${error.message}` : 'NÃO recusou (!)'}`)
}

// ── 3. desligar PERSISTE ────────────────────────────────────────────────────
console.log('\n── 3. Desligar um relatório persiste')
const OFF = { dre: false, financial: true, curva_abc: true, aging: true }
{
  const { error } = await admin.from('clinic_settings')
    .upsert({ clinic_id: clinicId, reports_enabled: OFF }, { onConflict: 'clinic_id' })
  check(!error, `upsert de saveReportsEnabled aceito${error ? ` — ${error.code}: ${error.message}` : ''}`)
}
{
  const { data } = await admin.from('clinic_settings')
    .select('reports_enabled').eq('clinic_id', clinicId).single()
  const raw = data?.reports_enabled
  check(!!raw && typeof raw === 'object', 'select de getReportsEnabled devolve um objeto (não cai no REPORTS_DEFAULTS)')
  // regra de getReportsEnabled: `raw[k] ?? true`
  check((raw?.dre ?? true) === false, 'o relatório DRE ficou DESLIGADO depois do save (dre=false persistido)')
  check((raw?.financial ?? true) === true, 'os demais relatórios continuam ligados (financial=true)')
  // ── 4. com esse valor, a regra de visibilidade esconde o relatório ────────
  const visible = (key) => raw?.[key] !== false
  check(visible('dre') === false, 'isReportVisible("dre") = false → o relatório SOME da tela')
  check(visible('financial') === true, 'isReportVisible("financial") = true → continua na tela')
}

// ── 5. religar PERSISTE e o relatório volta ─────────────────────────────────
console.log('\n── 5. Religar persiste e o relatório volta')
{
  const { error } = await admin.from('clinic_settings')
    .upsert({ clinic_id: clinicId, reports_enabled: { ...OFF, dre: true } }, { onConflict: 'clinic_id' })
  check(!error, `upsert de religar aceito${error ? ` — ${error.message}` : ''}`)
  const { data } = await admin.from('clinic_settings')
    .select('reports_enabled').eq('clinic_id', clinicId).single()
  const raw = data?.reports_enabled
  check((raw?.dre ?? true) === true, 'o relatório DRE voltou a LIGADO (dre=true persistido)')
  check(raw?.[ 'dre' ] !== false, 'isReportVisible("dre") = true → o relatório VOLTOU para a tela')
}

// ── 6. NULL continua sendo "todos ligados" ──────────────────────────────────
console.log('\n── 6. Clínica sem configuração salva')
{
  await admin.from('clinic_settings').update({ reports_enabled: null }).eq('clinic_id', clinicId)
  const { data } = await admin.from('clinic_settings')
    .select('reports_enabled').eq('clinic_id', clinicId).single()
  const raw = data?.reports_enabled
  check(raw === null, 'reports_enabled aceita NULL')
  check(!raw || typeof raw !== 'object', 'getReportsEnabled cai no REPORTS_DEFAULTS (todos ligados) — comportamento histórico preservado')
}

await cleanup()
console.log(`\n${pass} verificações OK · ${fail} falhas`)
process.exit(fail === 0 ? 0 : 1)
