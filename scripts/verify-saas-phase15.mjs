// Verificação pós-deploy da Fase 1.5 (re-grade 4 tiers).
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  const q = async (label, sql) => {
    const { rows } = await c.query(sql)
    console.log(`\n── ${label}`)
    console.table(rows)
  }

  await q('Planos',
    `SELECT plan_name, status, count(*)::int AS n FROM tenant_subscriptions GROUP BY 1,2 ORDER BY 1`)

  await q('Catálogo por bundle',
    `SELECT COALESCE(included_in_plan,'(avulso)') AS tier, count(*)::int AS n,
            min(monthly_price) AS min_price, max(monthly_price) AS max_price,
            count(*) FILTER (WHERE NOT is_available)::int AS indisponiveis
       FROM subscription_module_catalog GROUP BY 1 ORDER BY 1`)

  await q('Config de pricing',
    `SELECT premium_base_price, enterprise_base_price, annual_discount_percent FROM subscription_plan_config`)

  await q('Quota custom_documents por plano',
    `SELECT s.plan_name, q.limit_amount, count(*)::int AS n
       FROM tenant_quotas q JOIN tenant_subscriptions s ON s.clinic_id = q.clinic_id
      WHERE q.resource_name = 'custom_documents' GROUP BY 1,2 ORDER BY 1`)

  await q('user_limit por plano',
    `SELECT s.plan_name, c.user_limit, count(*)::int AS n
       FROM clinics c JOIN tenant_subscriptions s ON s.clinic_id = c.id GROUP BY 1,2 ORDER BY 1,2`)

  await q('Contratos das clínicas com flags (split 0368)',
    `SELECT cl.name, m.module_key, m.is_active,
            cl.flow_config->>'internacao_completa' AS ic, cl.flow_config->>'centro_cirurgico' AS cc
       FROM clinic_contracted_modules m JOIN clinics cl ON cl.id = m.clinic_id
      WHERE m.module_key IN ('hospitalization_simple','surgery_advanced') ORDER BY cl.name, m.module_key`)

  await q('Keys comerciais antigas residuais (deve ser vazio)',
    `SELECT module_key, count(*)::int AS n FROM clinic_contracted_modules
      WHERE module_key IN ('hospitalization_surgery','advanced_stock','finance_reports') GROUP BY 1`)
} finally {
  await c.end()
}
