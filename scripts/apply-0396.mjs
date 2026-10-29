import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const sql = readFileSync('supabase/migrations/0396_subscription_lifecycle_state.sql', 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  // 0396 é transacional (BEGIN/COMMIT internos) — roda direto
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    ['0396', 'subscription_lifecycle_state', [sql]]
  )
  const cols = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='tenant_subscriptions' AND column_name IN ('lifecycle_state','is_grandfathered') ORDER BY 1"
  )
  const dist = await c.query(
    "SELECT lifecycle_state, is_grandfathered, count(*)::int AS n FROM tenant_subscriptions GROUP BY 1,2 ORDER BY 1,2"
  )
  console.log('OK — 0396 aplicada')
  console.log('  colunas:', cols.rows.map(r => r.column_name).join(', '))
  console.log('  distribuição (lifecycle_state / grandfathered / n):')
  for (const r of dist.rows) console.log('   ', r.lifecycle_state, '/', r.is_grandfathered, '/', r.n)
} catch (e) { console.error('ERRO:', e.message); process.exit(1) }
finally { await c.end() }
