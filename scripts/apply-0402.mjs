import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const sql = readFileSync('supabase/migrations/0402_whatsapp_trigger_modules.sql', 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  await c.query(sql)
  await c.query('INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', ['0402','whatsapp_trigger_modules',[sql]])
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='clinic_whatsapp_settings' AND column_name='disabled_trigger_modules'")
  console.log('OK — 0402 aplicada; coluna:', cols.rows.map(r=>r.column_name).join(',') || 'NÃO ENCONTRADA')
} catch (e) { console.error('ERRO:', e.message); process.exit(1) } finally { await c.end() }
