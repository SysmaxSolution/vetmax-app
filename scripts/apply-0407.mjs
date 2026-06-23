import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const sql = readFileSync('supabase/migrations/0407_starter_plan.sql', 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    ['0407', 'starter_plan', [sql]]
  )
  const check = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='subscription_plan_config' AND column_name='starter_base_price'
  `)
  const planCheck = await c.query(`
    SELECT conname FROM pg_constraint WHERE conname='tenant_subscriptions_plan_name_check'
  `)
  console.log('OK — 0407 aplicada')
  console.log('  starter_base_price col:', check.rows.length ? 'OK' : 'AUSENTE')
  console.log('  plan_name check:', planCheck.rows.length ? 'OK' : 'AUSENTE')
} catch (e) { console.error('ERRO:', e.message); process.exit(1) }
finally { await c.end() }
