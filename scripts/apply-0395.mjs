import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const sql = readFileSync('supabase/migrations/0395_subscription_leads_and_price_audit.sql', 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  // 0395 é transacional (BEGIN/COMMIT internos) — roda direto
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    ['0395', 'subscription_leads_and_price_audit', [sql]]
  )
  const leads = await c.query("SELECT to_regclass('public.subscription_leads') AS tbl")
  const audit = await c.query("SELECT to_regclass('public.subscription_price_audit') AS tbl")
  console.log('OK — 0395 aplicada')
  console.log('  subscription_leads      =', leads.rows[0].tbl)
  console.log('  subscription_price_audit =', audit.rows[0].tbl)
} catch (e) { console.error('ERRO:', e.message); process.exit(1) }
finally { await c.end() }
