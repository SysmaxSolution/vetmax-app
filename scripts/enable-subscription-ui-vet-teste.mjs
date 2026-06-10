// SaaS Fase 1 — liga a flag de rollout da UI de Planos (flow_config.
// subscription_plans_ui) APENAS na clínica piloto Vet Teste.
// Liberação geral futura: UPDATE em massa desta mesma flag.
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }

const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  const { rows } = await c.query(
    `SELECT id, name FROM clinics WHERE name ILIKE '%vet teste%'`
  )
  if (rows.length === 0) {
    console.error('Clínica "Vet Teste" não encontrada.')
    process.exit(1)
  }
  for (const clinic of rows) {
    await c.query(
      `UPDATE clinics
          SET flow_config = COALESCE(flow_config, '{}'::jsonb) || '{"subscription_plans_ui": true}'::jsonb
        WHERE id = $1`,
      [clinic.id]
    )
    console.log(`OK — subscription_plans_ui=true em "${clinic.name}" (${clinic.id})`)
  }
  const { rows: check } = await c.query(
    `SELECT name, flow_config->>'subscription_plans_ui' AS flag FROM clinics WHERE name ILIKE '%vet teste%'`
  )
  console.log('Verificação:', JSON.stringify(check))
} catch (e) {
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
