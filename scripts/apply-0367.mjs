import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }

const sql = readFileSync('supabase/migrations/0367_backfill_flow_flag_contracts.sql', 'utf-8')
const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  await c.query('BEGIN')
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    ['0367', 'backfill_flow_flag_contracts', [sql]]
  )
  await c.query('COMMIT')
  console.log('OK — 0367 aplicada')
  const { rows } = await c.query(
    `SELECT c.name FROM clinic_contracted_modules m
       JOIN clinics c ON c.id = m.clinic_id
      WHERE m.module_key = 'hospitalization_surgery' AND m.is_active`
  )
  console.log('Clínicas com hospitalization_surgery contratado:', rows.map(r => r.name).join(', '))
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('ERRO:', e.message); process.exit(1)
} finally { await c.end() }
