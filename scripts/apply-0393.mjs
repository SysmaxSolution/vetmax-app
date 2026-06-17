import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const sql = readFileSync('supabase/migrations/0393_cashier_orphan_backfill_log.sql', 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  await c.query('BEGIN'); await c.query(sql)
  await c.query('INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    ['0393','cashier_orphan_backfill_log',[sql]])
  await c.query('COMMIT'); console.log('OK — 0393 aplicada')
} catch (e) { await c.query('ROLLBACK').catch(()=>{}); console.error('ERRO:', e.message); process.exit(1) }
finally { await c.end() }
