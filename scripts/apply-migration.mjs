/**
 * Aplica uma migration de supabase/migrations por número, via pg client direto.
 * Uso: node scripts/apply-migration.mjs 0198
 *
 * Motivo do pg direto: `supabase db push` está bloqueado por gaps no histórico
 * de schema_migrations nesta workstation. Migrations da sprint são aditivas e
 * idempotentes (IF NOT EXISTS / CREATE OR REPLACE), seguras p/ reaplicar.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const version = process.argv[2]
if (!version) { console.error('Uso: node scripts/apply-migration.mjs <versao>  (ex.: 0198)'); process.exit(1) }

const migDir = resolve(__dirname, '..', 'supabase', 'migrations')
const file = readdirSync(migDir).find(f => f.startsWith(version + '_'))
if (!file) { console.error(`FATAL: migration ${version}_* não encontrada em ${migDir}`); process.exit(1) }

const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] })
)
const conn = env.DATABASE_URL ?? env.POSTGRES_URL
if (!conn) { console.error('FATAL: DATABASE_URL ausente'); process.exit(1) }

const sql  = readFileSync(resolve(migDir, file), 'utf8')
const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '')

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
console.log(`→ Conectando… (aplicar ${file})`)
await client.connect()

try {
  await client.query(sql)
  const reg = await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, ARRAY[$3]::text[])
       ON CONFLICT (version) DO NOTHING
       RETURNING version`,
    [version, name, sql],
  )
  console.log(reg.rowCount > 0
    ? `✓ Migration ${version} aplicada e registrada.`
    : `• Migration ${version} já registrada — SQL idempotente reaplicado.`)
} catch (e) {
  console.error('✗ Erro:', e?.message ?? e)
  process.exitCode = 1
} finally {
  await client.end()
}
