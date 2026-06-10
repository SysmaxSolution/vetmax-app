import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }

const MIGRATIONS = [
  ['0364', 'subscription_premium_specialized'],
  ['0365', 'clinic_contracted_modules'],
  ['0366', 'subscription_module_catalog'],
]

const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  // Pré-checagem: nome real do(s) CHECK(s) de tenant_subscriptions
  const { rows: checks } = await c.query(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'tenant_subscriptions'::regclass AND contype = 'c'`
  )
  console.log('CHECKs atuais em tenant_subscriptions:', checks.map(r => r.conname).join(', ') || '(nenhum)')

  const { rows: plans } = await c.query(
    `SELECT plan_name, count(*)::int AS n FROM tenant_subscriptions GROUP BY plan_name ORDER BY plan_name`
  )
  console.log('Distribuição de planos ANTES:', JSON.stringify(plans))

  // Snapshot de backup OBRIGATÓRIO antes da 0364 (combinado com o PO)
  await c.query('DROP TABLE IF EXISTS _bkp_tenant_subscriptions_0364')
  await c.query('CREATE TABLE _bkp_tenant_subscriptions_0364 AS SELECT * FROM tenant_subscriptions')
  const { rows: [{ n: bkpCount }] } = await c.query(
    'SELECT count(*)::int AS n FROM _bkp_tenant_subscriptions_0364'
  )
  console.log(`Snapshot _bkp_tenant_subscriptions_0364 criado: ${bkpCount} linhas`)

  for (const [version, name] of MIGRATIONS) {
    const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, 'utf-8')
    await c.query('BEGIN')
    try {
      await c.query(sql)
      await c.query(
        'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [version, name, [sql]]
      )
      await c.query('COMMIT')
      console.log(`OK — ${version}_${name} aplicada`)
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {})
      throw new Error(`Falha em ${version}: ${e.message}`)
    }
  }

  // Verificações pós-aplicação
  const { rows: plansAfter } = await c.query(
    `SELECT plan_name, count(*)::int AS n FROM tenant_subscriptions GROUP BY plan_name ORDER BY plan_name`
  )
  console.log('Distribuição de planos DEPOIS:', JSON.stringify(plansAfter))

  const { rows: [{ n: catalogCount }] } = await c.query(
    'SELECT count(*)::int AS n FROM subscription_module_catalog'
  )
  const { rows: [cfg] } = await c.query(
    'SELECT premium_base_price, annual_discount_percent FROM subscription_plan_config WHERE id = 1'
  )
  const { rows: [{ n: contractedCount }] } = await c.query(
    'SELECT count(*)::int AS n FROM clinic_contracted_modules'
  )
  const { rows: [{ n: clinicCount }] } = await c.query('SELECT count(*)::int AS n FROM clinics')
  console.log(`Catálogo: ${catalogCount} módulos | Config: base=${cfg.premium_base_price} desconto=${cfg.annual_discount_percent}%`)
  console.log(`Backfill: ${contractedCount} linhas em clinic_contracted_modules para ${clinicCount} clínicas`)
} catch (e) {
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
