const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const url = env.match(/DATABASE_URL=(.+)/)[1].trim()
const m = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
const [, u, p, h, port, db] = m

const FILE = '0176_insurance_intelligence_layer.sql'

;(async () => {
  const c = new Client({user: u, password: decodeURIComponent(p), host: h, port: parseInt(port), database: db, ssl: {rejectUnauthorized: false}})
  await c.connect()
  console.log('▶ Aplicando', FILE)
  await c.query(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', FILE), 'utf8'))
  const v = FILE.split('_')[0]
  await c.query('INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [v, FILE.replace(/\.sql$/, '').replace(new RegExp(`^${v}_`), '')])

  const { rows: c1 } = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='pet_insurance' AND column_name='enrollment_date'")
  console.log(`  ${c1.length ? '✓' : '✗'} pet_insurance.enrollment_date`)
  const { rows: t1 } = await c.query("SELECT table_name FROM information_schema.tables WHERE table_name='insurance_plan_coverage'")
  console.log(`  ${t1.length ? '✓' : '✗'} tabela insurance_plan_coverage`)
  await c.end()
  console.log('✅ 0176 aplicada')
})().catch(e => { console.error('✗', e.message); process.exit(1) })
