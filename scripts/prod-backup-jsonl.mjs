// Backup lógico COMPLETO de produção em JSONL (uma linha por registro, um arquivo por tabela).
// Somente leitura. Credenciais lidas do env — nada hard-coded.
//
// Uso:
//   node scripts/prod-backup-jsonl.mjs --confirm=yivjuhurcadxtllmkkqd [--out=C:/caminho]
//
// Cobre: TODAS as tabelas de `public` + storage.buckets + storage.objects + auth.users
// (colunas não-sensíveis) + supabase_migrations.schema_migrations.
import { createRequire } from 'module'
import { mkdirSync, writeFileSync, appendFileSync, statSync } from 'node:fs'
import path from 'node:path'

const require = createRequire('C:/SysMax/package.json')
const dotenv = require('dotenv')
dotenv.config({ path: 'C:/SysMax/.env.local' })
const { Client } = require('pg')

const args = process.argv.slice(2)
const arg = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=')

const EXPECTED_REF = 'yivjuhurcadxtllmkkqd'
if (arg('confirm') !== EXPECTED_REF) {
  console.error(`ABORTADO: passe --confirm=${EXPECTED_REF} para confirmar o alvo de produção.`)
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('ABORTADO: DATABASE_URL ausente no env.')
  process.exit(1)
}

const u = new URL(process.env.DATABASE_URL)
u.port = '5432' // session pooler
if (!u.username.endsWith(EXPECTED_REF)) {
  console.error(`ABORTADO: DATABASE_URL não aponta para ${EXPECTED_REF} (user=${u.username}).`)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13) // YYYYMMDDHHmm-ish
const OUT = arg('out') || `C:/SysMax-backup-virada-${stamp}`
mkdirSync(OUT, { recursive: true })

console.log(`Alvo: ${u.hostname}:${u.port} user=${u.username}`)
console.log(`Destino: ${OUT}\n`)

const client = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } })
await client.connect()

const summary = []
let grandRows = 0

async function dump(schema, table, selectExpr = '*') {
  const file = path.join(OUT, `${schema === 'public' ? '' : schema + '.'}${table}.jsonl`)
  writeFileSync(file, '')
  let offset = 0
  let total = 0
  const PAGE = 2000
  // ordenação estável pelo ctid para não depender de PK
  for (;;) {
    const { rows } = await client.query(
      `SELECT ${selectExpr} FROM "${schema}"."${table}" ORDER BY ctid LIMIT ${PAGE} OFFSET ${offset}`
    )
    if (rows.length === 0) break
    appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
    total += rows.length
    if (rows.length < PAGE) break
    offset += PAGE
  }
  const bytes = statSync(file).size
  summary.push({ schema, table, rows: total, bytes })
  grandRows += total
  if (total > 0) console.log(`  ✓ ${schema}.${table}: ${total} linhas (${bytes} bytes)`)
  return total
}

// 1) todas as tabelas base de public
const { rows: pub } = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_type='BASE TABLE'
  ORDER BY table_name`)
console.log(`Tabelas em public: ${pub.length}`)
for (const r of pub) {
  try {
    await dump('public', r.table_name)
  } catch (e) {
    console.error(`  ! ERRO em public.${r.table_name}: ${e.message}`)
    summary.push({ schema: 'public', table: r.table_name, rows: -1, error: e.message })
  }
}

// 2) storage + controle de migrations + auth.users (sem hashes de senha)
const extras = [
  ['storage', 'buckets', '*'],
  ['storage', 'objects', 'id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata'],
  ['supabase_migrations', 'schema_migrations', '*'],
  ['auth', 'users', 'id, email, phone, created_at, updated_at, last_sign_in_at, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, banned_until, deleted_at'],
  ['auth', 'identities', 'id, user_id, provider, provider_id, created_at, updated_at'],
]
for (const [s, t, sel] of extras) {
  try {
    await dump(s, t, sel)
  } catch (e) {
    console.error(`  ! ERRO em ${s}.${t}: ${e.message}`)
    summary.push({ schema: s, table: t, rows: -1, error: e.message })
  }
}

// 3) snapshot do schema (colunas de todas as tabelas) — útil no diff pós-virada
const { rows: cols } = await client.query(`
  SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema IN ('public','storage','auth')
  ORDER BY table_schema, table_name, ordinal_position`)
writeFileSync(path.join(OUT, '_schema_columns.jsonl'), cols.map((r) => JSON.stringify(r)).join('\n') + '\n')

const manifest = {
  generated_at: new Date().toISOString(),
  project_ref: EXPECTED_REF,
  host: u.hostname,
  tables_public: pub.length,
  tables_dumped: summary.length,
  total_rows: grandRows,
  schema_columns: cols.length,
  tables: summary,
}
writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2))

await client.end()

console.log(`\nBACKUP OK`)
console.log(`  tabelas public: ${pub.length}`)
console.log(`  arquivos gravados: ${summary.length}`)
console.log(`  linhas totais: ${grandRows}`)
console.log(`  colunas no snapshot de schema: ${cols.length}`)
console.log(`  destino: ${OUT}`)
