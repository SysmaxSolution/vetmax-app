import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }

const sql = readFileSync('supabase/migrations/0357_patient_last_known_weight.sql', 'utf-8')
const c = new pg.Client({ connectionString: url })
await c.connect()
c.on('notice', n => console.log('  · ' + (n.message ?? n)))
try {
  await c.query('BEGIN')
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    ['0357', 'patient_last_known_weight', [sql]]
  )
  await c.query('COMMIT')
  const r = await c.query('SELECT COUNT(*) AS n FROM patients WHERE last_known_weight IS NOT NULL')
  console.log(`OK — 0357 aplicada. Pets com peso pré-populado: ${r.rows[0].n}`)
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('ERRO:', e.message)
  process.exit(1)
} finally { await c.end() }
