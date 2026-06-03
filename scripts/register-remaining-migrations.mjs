/**
 * Registra em supabase_migrations.schema_migrations todas as migrations cujos
 * arquivos existem localmente mas não estão registradas. Não reexecuta SQL
 * (assume que os objetos já estão no banco — gap pré-existente).
 *
 * É seguro porque o estado físico do banco está completo; só falta o tracking.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }

const MIG_DIR = 'supabase/migrations'
const files = readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort()

const c = new pg.Client({ connectionString: url })
await c.connect()

const reg = await c.query('SELECT version FROM supabase_migrations.schema_migrations')
const registered = new Set(reg.rows.map(r => r.version))

let added = 0
let alreadyOk = 0
for (const file of files) {
  const m = file.match(/^(\d+)_(.+)\.sql$/)
  if (!m) continue
  const [, version, name] = m
  if (registered.has(version)) { alreadyOk++; continue }

  const sql = readFileSync(`${MIG_DIR}/${file}`, 'utf-8')
  try {
    await c.query(
      'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3)',
      [version, name, [sql]]
    )
    console.log(`✓ ${version} ${name}`)
    added++
  } catch (e) {
    console.error(`✗ ${version} ${name}:`, e.message)
    process.exit(1)
  }
}

await c.end()
console.log(`\nRegistrados agora: ${added}  ·  Já estavam: ${alreadyOk}  ·  Total no arquivo: ${files.length}`)
