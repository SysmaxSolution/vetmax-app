// Aplica a 0368 (re-grade comercial Fase 1.5) com pré e pós-checagens.
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }

const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  // ── Pré-checagens ──────────────────────────────────────────────────────────
  const { rows: contractCounts } = await c.query(
    `SELECT module_key, count(*)::int AS n FROM clinic_contracted_modules
      WHERE module_key IN ('hospitalization_surgery','advanced_stock','finance_reports')
      GROUP BY 1 ORDER BY 1`
  )
  console.log('Contratos em keys antigas:', JSON.stringify(contractCounts))

  const { rows: freeOverLimit } = await c.query(
    `SELECT c.name, c.user_limit,
            (SELECT count(*)::int FROM profiles p WHERE p.clinic_id = c.id) AS users,
            (SELECT count(*)::int FROM document_templates t WHERE t.clinic_id = c.id) AS docs
       FROM clinics c
       JOIN tenant_subscriptions s ON s.clinic_id = c.id
      WHERE s.plan_name = 'free'`
  )
  console.log('Clínicas FREE (users/docs atuais — avisar PO se acima de 3):')
  console.table(freeOverLimit)

  // ── Aplicação ──────────────────────────────────────────────────────────────
  const sql = readFileSync('supabase/migrations/0368_plan_regrade_enterprise.sql', 'utf-8')
  await c.query('BEGIN')
  await c.query(sql)
  await c.query(
    'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    ['0368', 'plan_regrade_enterprise', [sql]]
  )
  await c.query('COMMIT')
  console.log('OK — 0368 aplicada')

  // ── Pós-checagens ──────────────────────────────────────────────────────────
  const { rows: tiers } = await c.query(
    `SELECT COALESCE(included_in_plan,'(avulso)') AS tier, count(*)::int AS n,
            min(monthly_price) AS min_price, max(monthly_price) AS max_price
       FROM subscription_module_catalog GROUP BY 1 ORDER BY 1`
  )
  console.table(tiers)

  const { rows: cfg } = await c.query(
    `SELECT premium_base_price, enterprise_base_price, annual_discount_percent FROM subscription_plan_config`
  )
  console.table(cfg)

  const { rows: migrated } = await c.query(
    `SELECT cl.name, m.module_key, m.is_active,
            cl.flow_config->>'internacao_completa' AS ic, cl.flow_config->>'centro_cirurgico' AS cc
       FROM clinic_contracted_modules m JOIN clinics cl ON cl.id = m.clinic_id
      WHERE m.module_key IN ('hospitalization_simple','surgery_advanced') ORDER BY cl.name, m.module_key`
  )
  console.log('Contratos migrados (split hospitalization_surgery):')
  console.table(migrated)

  const { rows: residual } = await c.query(
    `SELECT count(*)::int AS n FROM clinic_contracted_modules
      WHERE module_key IN ('hospitalization_surgery','advanced_stock','finance_reports')`
  )
  console.log('Keys antigas residuais (deve ser 0):', residual[0].n)

  const { rows: quotas } = await c.query(
    `SELECT s.plan_name, q.limit_amount, count(*)::int AS n
       FROM tenant_quotas q JOIN tenant_subscriptions s ON s.clinic_id = q.clinic_id
      WHERE q.resource_name = 'custom_documents' GROUP BY 1,2 ORDER BY 1`
  )
  console.log('Quota custom_documents por plano:')
  console.table(quotas)

  const { rows: limits } = await c.query(
    `SELECT s.plan_name, c.user_limit, count(*)::int AS n
       FROM clinics c JOIN tenant_subscriptions s ON s.clinic_id = c.id
      GROUP BY 1,2 ORDER BY 1,2`
  )
  console.log('user_limit por plano:')
  console.table(limits)
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
