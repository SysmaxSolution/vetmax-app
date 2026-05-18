/**
 * Aplica migration 0170 (document_templates.canvas_state) direto via pg,
 * contornando o `supabase db push` bloqueado por colisões em schema_migrations.
 * SQL idempotente: ALTER ... IF NOT EXISTS + CHECK constraint com guard.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
const env = Object.fromEntries(
  envText.split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] })
)

const conn = env.DATABASE_URL ?? env.POSTGRES_URL
if (!conn) { console.error('FATAL: DATABASE_URL ausente'); process.exit(1) }

const sql = readFileSync(
  resolve(__dirname, '..', 'supabase', 'migrations', '0170_document_templates_canvas_state.sql'),
  'utf8',
)

const VERSION = '0170'
const NAME = 'document_templates_canvas_state'

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })

console.log('→ Conectando…')
await client.connect()
console.log('→ Aplicando 0170…')

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
    : `• Migration ${VERSION} já existia — apenas garantiu coluna (idempotente).`)
} catch (e) {
  await client.query('ROLLBACK')
  console.error('✗ Erro:', e?.message ?? e)
  process.exitCode = 1
} finally {
  const { rows } = await client.query(`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'document_templates' AND column_name = 'canvas_state'
  `)
  console.log('\nColuna canvas_state:', rows[0] ?? 'NÃO ENCONTRADA')
  await client.end()
}
