/**
 * Aplica migration 0169 (Canva Nativo) direto via pg, contornando o
 * `supabase db push` que está bloqueado por colisões em schema_migrations
 * (estado pré-existente do histórico, não desta sprint).
 *
 * Como a 0169 é 100% idempotente (ADD COLUMN IF NOT EXISTS + CHECK constraint
 * com guard + bucket ON CONFLICT DO NOTHING), rodar o SQL diretamente é
 * seguro: re-execuções não criam efeitos colaterais.
 *
 * Pós-execução, marca a versão como aplicada em supabase_migrations.schema_migrations.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Carrega .env.local sem dotenv (sem dep adicional)
const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
const env = Object.fromEntries(
  envText.split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]
    })
)

const conn = env.DATABASE_URL ?? env.POSTGRES_URL
if (!conn) {
  console.error('FATAL: DATABASE_URL ausente em .env.local')
  process.exit(1)
}

const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '0169_patient_documents_canva_native.sql')
const sql = readFileSync(sqlPath, 'utf8')

const VERSION = '0169'
const NAME = 'patient_documents_canva_native'

const client = new pg.Client({
  connectionString: conn,
  ssl: { rejectUnauthorized: false },
})

console.log('→ Conectando ao Postgres remoto…')
await client.connect()
console.log('→ Conectado. Aplicando 0169_patient_documents_canva_native.sql…')

try {
  await client.query('BEGIN')
  await client.query(sql)

  // Registra no schema_migrations se ainda não estiver
  const reg = await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY[$3]::text[])
       ON CONFLICT (version) DO NOTHING
       RETURNING version`,
    [VERSION, NAME, sql],
  )

  await client.query('COMMIT')
  console.log(reg.rowCount > 0
    ? `✓ Migration ${VERSION} registrada em schema_migrations.`
    : `• Migration ${VERSION} já estava registrada — apenas garantiu colunas (idempotente).`)
} catch (e) {
  await client.query('ROLLBACK')
  console.error('✗ Erro aplicando 0169:', e?.message ?? e)
  process.exitCode = 1
} finally {
  // Verifica colunas resultantes
  const { rows } = await client.query(`
    SELECT column_name, data_type, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'patient_documents'
       AND column_name IN ('background_image_url','margin_top','margin_bottom','margin_left','margin_right','block_style','content_json')
     ORDER BY column_name
  `)
  console.log('\nColunas Canva em patient_documents:')
  for (const r of rows) {
    console.log(`  • ${r.column_name.padEnd(22)} ${r.data_type.padEnd(20)} default=${r.column_default ?? '—'}`)
  }
  await client.end()
}
