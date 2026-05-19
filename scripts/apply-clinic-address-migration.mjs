/**
 * Aplica migration 0171 (clinics.city/state/cep/neighborhood) direto via pg.
 * SQL idempotente: ADD COLUMN IF NOT EXISTS.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] })
)

const conn = env.DATABASE_URL ?? env.POSTGRES_URL
if (!conn) { console.error('FATAL: DATABASE_URL ausente'); process.exit(1) }

const sql = readFileSync(
  resolve(__dirname, '..', 'supabase', 'migrations', '0171_clinics_address_fields.sql'),
  'utf8',
)

const VERSION = '0171'
const NAME = 'clinics_address_fields'

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })

console.log('→ Conectando…')
await client.connect()
console.log('→ Aplicando 0171…')

try {
  await client.query('BEGIN')
  await client.query(sql)
  const reg = await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY[$3]::text[])
       ON CONFLICT (version) DO NOTHING
       RETURNING version`,
    [VERSION, NAME, sql],
  )
  await client.query('COMMIT')
  console.log(reg.rowCount > 0
    ? `✓ Migration ${VERSION} registrada.`
    : `• ${VERSION} já existia — apenas garantiu colunas.`)
} catch (e) {
  await client.query('ROLLBACK')
  console.error('✗ Erro:', e?.message ?? e)
  process.exitCode = 1
} finally {
  const { rows } = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='clinics'
       AND column_name IN ('city','state','cep','neighborhood')
     ORDER BY column_name
  `)
  console.log('\nColunas de endereço:')
  for (const r of rows) console.log(`  • ${r.column_name.padEnd(14)} ${r.data_type}`)
  await client.end()
}
