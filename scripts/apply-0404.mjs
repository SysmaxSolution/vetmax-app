import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const sql = readFileSync('supabase/migrations/0404_stock_units_per_package.sql', 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  await c.query(sql)
  await c.query('INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', ['0404','stock_units_per_package',[sql]])
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='stock_items' AND column_name='units_per_package'")
  console.log('OK — 0404; coluna:', cols.rows.map(r=>r.column_name).join(',')||'NÃO ENCONTRADA')
} catch(e){ console.error('ERRO:', e.message); process.exit(1) } finally { await c.end() }
