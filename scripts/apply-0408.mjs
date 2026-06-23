import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const sql = readFileSync('supabase/migrations/0408_repackaging_modulos.sql', 'utf-8')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    ['0408', 'repackaging_modulos', [sql]]
  )
  const tiers = await c.query(`
    SELECT included_in_plan, string_agg(module_key, ', ' ORDER BY sort_order) AS modules
      FROM subscription_module_catalog
     WHERE included_in_plan IS NOT NULL
     GROUP BY included_in_plan ORDER BY included_in_plan`)
  console.log('OK — 0408 aplicada')
  for (const r of tiers.rows) console.log(`  ${r.included_in_plan}: ${r.modules}`)
  const free = await c.query(`
    SELECT count(*) AS n FROM clinics c JOIN tenant_subscriptions s ON s.clinic_id=c.id
     WHERE (s.plan_name='free' OR s.plan_name IS NULL) AND c.active_modules @> '["cashier"]'::jsonb`)
  console.log(`  free clinics ainda com cashier: ${free.rows[0].n}`)
} catch (e) { console.error('ERRO:', e.message); process.exit(1) }
finally { await c.end() }
