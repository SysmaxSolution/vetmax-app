/**
 * Aplica migration 0196 (base Internação Completa + Centro Cirúrgico) direto via pg.
 * SQL idempotente: ALTER ... ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
 *
 * Motivo do pg client direto: `supabase db push` está bloqueado por gaps no
 * histórico de schema_migrations (0155-0159 etc.) nesta workstation.
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
  resolve(__dirname, '..', 'supabase', 'migrations', '0196_internacao_completa_base.sql'),
  'utf8',
)

const VERSION = '0196'
const NAME = 'internacao_completa_base'

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })

console.log('→ Conectando…')
await client.connect()
console.log('→ Aplicando 0196…')

try {
  await client.query(sql)

  const reg = await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY[$3]::text[])
       ON CONFLICT (version) DO NOTHING
       RETURNING version`,
    [VERSION, NAME, sql],
  )

  console.log(reg.rowCount > 0
    ? `✓ Migration ${VERSION} registrada.`
    : `• Migration ${VERSION} já registrada — SQL idempotente reaplicado.`)
} catch (e) {
  console.error('✗ Erro:', e?.message ?? e)
  process.exitCode = 1
} finally {
  const hospCols = await client.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hospitalizations'
       AND column_name IN ('box_id','estimated_discharge','weight_at_admission','attending_vet_id','personal_belongings','diet_notes','fasting','isolation_required')
     ORDER BY column_name
  `)
  const vitals = await client.query(`
    SELECT to_regclass('public.clinical_vitals') AS tbl
  `)
  console.log('\nColunas novas em hospitalizations:', hospCols.rows.map(r => r.column_name).join(', ') || 'NENHUMA')
  console.log('Tabela clinical_vitals:', vitals.rows[0]?.tbl ?? 'NÃO ENCONTRADA')
  await client.end()
}
