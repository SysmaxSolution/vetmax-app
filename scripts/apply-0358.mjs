import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }

const sql = readFileSync('supabase/migrations/0358_patient_notes_and_death.sql', 'utf-8')
const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  await c.query('BEGIN')
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    ['0358', 'patient_notes_and_death', [sql]]
  )
  await c.query('COMMIT')
  console.log('OK — 0358 aplicada')
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('ERRO:', e.message); process.exit(1)
} finally { await c.end() }
