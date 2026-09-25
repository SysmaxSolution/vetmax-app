import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const sql = readFileSync('supabase/migrations/0398_subscription_past_due_since.sql', 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  // 0398 é transacional (BEGIN/COMMIT internos) — roda direto
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    ['0398', 'subscription_past_due_since', [sql]]
  )
  const cols = await c.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tenant_subscriptions' AND column_name='past_due_since'"
  )
  console.log('OK — 0398 aplicada')
  console.log('  coluna:', cols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', ') || 'NÃO ENCONTRADA')
} catch (e) { console.error('ERRO:', e.message); process.exit(1) }
finally { await c.end() }
