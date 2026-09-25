import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const sql = readFileSync('supabase/migrations/0380_asaas_billing.sql', 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  // 0380 já é transacional (BEGIN/COMMIT internos) — roda direto
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    ['0380', 'asaas_billing', [sql]]
  )
  // sanity: tabela e colunas criadas?
  const t = await c.query("SELECT to_regclass('public.subscription_invoices') AS tbl")
  const col = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='tenant_subscriptions' AND column_name LIKE 'asaas_%' ORDER BY 1"
  )
  console.log('OK — 0380 aplicada')
  console.log('  subscription_invoices =', t.rows[0].tbl)
  console.log('  cols asaas em tenant_subscriptions =', col.rows.map(r => r.column_name).join(', '))
} catch (e) { console.error('ERRO:', e.message); process.exit(1) }
finally { await c.end() }
