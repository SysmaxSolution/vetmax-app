// Verificação pós-deploy da Fase 1 SaaS (roteiro §7 do plano).
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  const q = async (label, sql) => {
    const { rows } = await c.query(sql)
    console.log(`\n── ${label}`)
    console.table ? console.table(rows) : console.log(JSON.stringify(rows, null, 2))
  }

  await q('Planos (sem pro/enterprise residual)',
    `SELECT plan_name, status, count(*)::int AS n FROM tenant_subscriptions GROUP BY 1,2 ORDER BY 1`)

  await q('Catálogo',
    `SELECT module_key, monthly_price, sort_order, array_length(included_module_keys,1) AS keys, array_length(flow_flags,1) AS flags
       FROM subscription_module_catalog ORDER BY sort_order`)

  await q('Config de pricing',
    `SELECT premium_base_price, annual_discount_percent FROM subscription_plan_config`)

  await q('Paridade backfill (módulos ativos vs contratados, por clínica)',
    `SELECT c.name,
            jsonb_array_length(COALESCE(c.active_modules,'[]'::jsonb)) AS active_n,
            (SELECT count(*)::int FROM clinic_contracted_modules m
              WHERE m.clinic_id = c.id AND m.is_active) AS contracted_n,
            c.flow_config->>'subscription_plans_ui' AS plans_ui
       FROM clinics c ORDER BY c.name`)

  await q('Snapshot de backup',
    `SELECT count(*)::int AS bkp_rows FROM _bkp_tenant_subscriptions_0364`)
} finally {
  await c.end()
}
