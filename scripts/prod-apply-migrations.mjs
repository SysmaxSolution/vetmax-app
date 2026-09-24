// Aplicação CONTROLADA de migrations em produção — uma transação por arquivo,
// sonda do objeto-chave ANTES e DEPOIS, parada no primeiro erro, log em disco.
//
// `supabase db push` está PROIBIDO nesta base (schema_migrations mente: para em 0408
// enquanto os objetos existem muito além disso). Este script é o caminho auditável.
//
// Uso:
//   node scripts/prod-apply-migrations.mjs --confirm=yivjuhurcadxtllmkkqd [--apply] [--only=0468,0469] [--src=DIR]
//
// --dry-run é o padrão: só roda as sondas ANTES e imprime o plano.
// --apply   executa de verdade.
//
// Credenciais: C:/SysMax/.env.local (DATABASE_URL), porta forçada para 5432 (session pooler,
// que garante BEGIN/COMMIT multi-statement por sessão). Nunca imprime segredo.
import { createRequire } from 'module'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const require = createRequire('C:/SysMax/package.json')
const dotenv = require('dotenv')
dotenv.config({ path: 'C:/SysMax/.env.local' })
const { Client } = require('pg')

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const arg = (n) => {
  const a = args.find((x) => x.startsWith(`--${n}=`))
  return a ? a.split('=').slice(1).join('=') : null
}

const EXPECTED_REF = 'yivjuhurcadxtllmkkqd'
const APPLY = flag('apply')
const ONLY = arg('only') ? new Set(arg('only').split(',').map((s) => s.trim())) : null
const SRC = arg('src') || 'C:/sysvetmax-dev/supabase/migrations'

if (arg('confirm') !== EXPECTED_REF) {
  console.error(`ABORTADO: passe --confirm=${EXPECTED_REF}`)
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('ABORTADO: DATABASE_URL ausente.')
  process.exit(1)
}
const u = new URL(process.env.DATABASE_URL)
u.port = '5432'
if (!u.username.endsWith(EXPECTED_REF)) {
  console.error(`ABORTADO: DATABASE_URL aponta para ${u.username}, não para ${EXPECTED_REF}.`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(path.join('C:/SysMax/scripts', 'prod-migration-manifest.json'), 'utf8'))

const LOGDIR = 'C:/SysMax/.tmp/virada'
mkdirSync(LOGDIR, { recursive: true })
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-').slice(0, 13)
const mode = APPLY ? 'apply' : 'dryrun'
const logTxt = path.join(LOGDIR, `${mode}-${stamp}.log`)
const logJson = path.join(LOGDIR, `${mode}-${stamp}.json`)
const lines = []
const records = []
const say = (s) => {
  console.log(s)
  lines.push(s)
}

const client = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } })
await client.connect()

async function probe(p) {
  switch (p.kind) {
    case 'table': {
      const r = await client.query(
        `select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [p.table])
      return r.rowCount > 0
    }
    case 'column': {
      const r = await client.query(
        `select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
        [p.table, p.column])
      return r.rowCount > 0
    }
    case 'column_nullable': {
      const r = await client.query(
        `select is_nullable from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
        [p.table, p.column])
      return r.rowCount > 0 && r.rows[0].is_nullable === 'YES'
    }
    case 'function': {
      const r = await client.query(
        `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`,
        [p.function])
      return r.rowCount > 0
    }
    case 'function_body_contains': {
      const r = await client.query(
        `select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname=$1`, [p.function])
      return r.rows.some((x) => String(x.def).includes(p.contains))
    }
    case 'constraint_contains': {
      const r = await client.query(
        `select pg_get_constraintdef(oid) def from pg_constraint where conname=$1`, [p.constraint])
      return r.rows.some((x) => String(x.def).includes(p.contains))
    }
    case 'index': {
      const r = await client.query(`select 1 from pg_indexes where schemaname='public' and indexname=$1`, [p.index])
      return r.rowCount > 0
    }
    case 'bucket': {
      const r = await client.query(`select 1 from storage.buckets where id=$1`, [p.bucket])
      return r.rowCount > 0
    }
    case 'cron': {
      const r = await client.query(`select 1 from cron.job where jobname=$1`, [p.job])
      return r.rowCount > 0
    }
    default:
      throw new Error(`sonda desconhecida: ${p.kind}`)
  }
}

const describe = (p) =>
  p.kind === 'table' ? `table ${p.table}`
  : p.kind === 'column' ? `column ${p.table}.${p.column}`
  : p.kind === 'column_nullable' ? `column ${p.table}.${p.column} nullable`
  : p.kind === 'function' ? `function ${p.function}()`
  : p.kind === 'function_body_contains' ? `function ${p.function}() contém "${p.contains}"`
  : p.kind === 'constraint_contains' ? `constraint ${p.constraint} contém "${p.contains}"`
  : p.kind === 'index' ? `index ${p.index}`
  : p.kind === 'bucket' ? `bucket ${p.bucket}`
  : p.kind === 'cron' ? `cron job ${p.job}`
  : JSON.stringify(p)

say(`=== prod-apply-migrations · modo ${APPLY ? 'APPLY' : 'DRY-RUN'} ===`)
say(`alvo: ${u.hostname}:${u.port} user=${u.username}`)
say(`origem dos .sql: ${SRC}`)
say(`manifesto: ${manifest.length} entradas`)
if (ONLY) say(`--only: ${[...ONLY].join(',')}`)
say('')

const before = await client.query(
  `select count(*)::int n, max(version) mx from supabase_migrations.schema_migrations`)
say(`schema_migrations ANTES: ${before.rows[0].n} registros, max=${before.rows[0].mx}`)
say('')

let nApply = 0, nSkip = 0, nReconciled = 0, nFail = 0

for (const m of manifest) {
  if (ONLY && !ONLY.has(m.version)) continue
  const file = path.join(SRC, m.file)
  if (!existsSync(file)) {
    say(`✗ ${m.version} ${m.file} — ARQUIVO NÃO ENCONTRADO em ${SRC}. ABORTANDO.`)
    nFail++
    break
  }

  let pre = await probe(m.probe)
  if (!pre && m.also_applied_if) pre = await probe(m.also_applied_if)

  const registered = (await client.query(
    `select 1 from supabase_migrations.schema_migrations where version=$1`, [m.version])).rowCount > 0

  if (pre) {
    // já aplicada: só reconcilia o registro de controle (sem DDL)
    if (!registered) {
      if (APPLY) {
        await client.query(
          `insert into supabase_migrations.schema_migrations (version, name) values ($1,$2) on conflict do nothing`,
          [m.version, m.name])
        nReconciled++
        say(`· ${m.version} SKIP (já aplicada) — ${describe(m.probe)} presente · registro RECONCILIADO`)
      } else {
        nReconciled++
        say(`· ${m.version} SKIP (já aplicada) — ${describe(m.probe)} presente · registro seria RECONCILIADO`)
      }
    } else {
      say(`· ${m.version} SKIP (já aplicada e já registrada) — ${describe(m.probe)} presente`)
    }
    nSkip++
    records.push({ version: m.version, file: m.file, antes: true, depois: true, status: 'SKIP', ms: 0 })
    continue
  }

  if (!APPLY) {
    say(`→ ${m.version} APLICAR — ${describe(m.probe)} AUSENTE`)
    nApply++
    records.push({ version: m.version, file: m.file, antes: false, depois: null, status: 'PLANEJADA', ms: 0 })
    continue
  }

  const sql = readFileSync(file, 'utf8')
  const t0 = Date.now()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    const post = await probe(m.probe)
    if (!post) {
      await client.query('ROLLBACK')
      const ms = Date.now() - t0
      say(`✗ ${m.version} FALHOU — sonda DEPOIS negativa (${describe(m.probe)} não apareceu). ROLLBACK. ABORTANDO.`)
      records.push({ version: m.version, file: m.file, antes: false, depois: false, status: 'ERRO_SONDA', ms })
      nFail++
      break
    }
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name) values ($1,$2) on conflict do nothing`,
      [m.version, m.name])
    await client.query('COMMIT')
    const ms = Date.now() - t0
    say(`✓ ${m.version} ${m.name} — aplicada (${ms}ms) · ${describe(m.probe)} OK`)
    records.push({ version: m.version, file: m.file, antes: false, depois: true, status: 'APLICADA', ms })
    nApply++
  } catch (e) {
    try { await client.query('ROLLBACK') } catch {}
    const ms = Date.now() - t0
    say(`✗ ${m.version} ${m.file} — ERRO: ${e.message}`)
    say(`  (transação revertida; script abortado no primeiro erro)`)
    records.push({ version: m.version, file: m.file, antes: false, depois: false, status: 'ERRO', erro: e.message, ms })
    nFail++
    break
  }
}

const after = await client.query(
  `select count(*)::int n, max(version) mx from supabase_migrations.schema_migrations`)
say('')
say(`schema_migrations DEPOIS: ${after.rows[0].n} registros, max=${after.rows[0].mx}`)
say(`resumo: ${APPLY ? 'aplicadas' : 'a aplicar'}=${nApply} · skip=${nSkip} (reconciliadas=${nReconciled}) · falhas=${nFail}`)

if (APPLY && nFail === 0) {
  await client.query(`NOTIFY pgrst, 'reload schema'`)
  say(`NOTIFY pgrst, 'reload schema' enviado.`)
}

await client.end()

writeFileSync(logTxt, lines.join('\n') + '\n')
writeFileSync(logJson, JSON.stringify({ mode, stamp, src: SRC, before: before.rows[0], after: after.rows[0], records }, null, 2))
console.log(`\nlog: ${logTxt}\n     ${logJson}`)
process.exit(nFail > 0 ? 1 : 0)
