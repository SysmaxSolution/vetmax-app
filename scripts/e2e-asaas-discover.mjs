import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })

const present = (k) => (process.env[k] && String(process.env[k]).length > 0 ? 'SET' : 'EMPTY')
console.log('env presence:')
for (const k of ['DATABASE_URL', 'ASAAS_ENV', 'SANDBOX_ASAAS_WEBHOOK_TOKEN', 'ASAAS_WEBHOOK_TOKEN', 'SANDBOX_ASAAS_API_KEY', 'ASAAS_API_KEY']) {
  console.log('  ', k, '=', present(k))
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  const clinics = await c.query(
    "SELECT id, name, business_type FROM clinics WHERE name ILIKE '%teste%' OR name ILIKE '%test%' ORDER BY name LIMIT 10"
  )
  console.log('\nclínicas candidatas a teste:')
  for (const r of clinics.rows) console.log('  ', r.id, '|', r.name, '|', r.business_type)

  const prem = await c.query(
    "SELECT module_key, included_module_keys, flow_flags FROM subscription_module_catalog WHERE included_in_plan='premium' ORDER BY sort_order"
  )
  console.log('\nbundle premium (module_key → included_module_keys):')
  for (const r of prem.rows) console.log('  ', r.module_key, '→', JSON.stringify(r.included_module_keys), 'flags', JSON.stringify(r.flow_flags))
} catch (e) { console.error('ERRO:', e.message); process.exit(1) }
finally { await c.end() }
