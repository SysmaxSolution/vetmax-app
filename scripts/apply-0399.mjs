import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const sql = readFileSync('supabase/migrations/0399_pet_active_attendance.sql', 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    ['0399', 'pet_active_attendance', [sql]]
  )
  const fn = await c.query(
    "SELECT proname FROM pg_proc WHERE proname = 'pet_active_attendance'"
  )
  console.log('OK — 0399 aplicada')
  console.log('  função:', fn.rows.map(r => r.proname).join(', ') || 'NÃO ENCONTRADA')
} catch (e) { console.error('ERRO:', e.message); process.exit(1) }
finally { await c.end() }
