// Hotfix: re-aplica auto_provision_tenant com reset_interval='monthly' na
// quota custom_documents (NULL violava o NOT NULL da 0147 e quebrava QUALQUER
// criação de clínica nova). Extrai o trecho da função do arquivo 0368 corrigido.
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  const sql = readFileSync('supabase/migrations/0368_plan_regrade_enterprise.sql', 'utf-8')
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.auto_provision_tenant\(\)[\s\S]*?\$function\$;/)
  if (!fnMatch) throw new Error('Função não encontrada no arquivo 0368')
  await c.query(fnMatch[0])
  console.log('OK — auto_provision_tenant re-aplicada (custom_documents com reset_interval monthly)')

  // Smoke: cria e remove uma clínica descartável para validar o trigger
  const { rows: [clinic] } = await c.query(
    `INSERT INTO clinics (name) VALUES ('__smoke_test_0368__') RETURNING id`
  )
  const { rows: quotas } = await c.query(
    `SELECT resource_name, limit_amount FROM tenant_quotas WHERE clinic_id = $1 ORDER BY resource_name`,
    [clinic.id]
  )
  console.log('Smoke clínica nova — quotas provisionadas:', JSON.stringify(quotas))
  await c.query(`DELETE FROM clinics WHERE id = $1`, [clinic.id])
  console.log('Smoke clínica removida.')
} catch (e) {
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
