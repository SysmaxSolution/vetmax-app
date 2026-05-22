const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const url = env.match(/DATABASE_URL=(.+)/)[1].trim()
const m = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
const [, u, p, h, port, db] = m

const FILE = '0177_invoice_partial_payments.sql'

;(async () => {
  const c = new Client({ user: u, password: decodeURIComponent(p), host: h, port: parseInt(port), database: db, ssl: { rejectUnauthorized: false } })
  await c.connect()
  console.log('▶ Aplicando', FILE)
  await c.query(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', FILE), 'utf8'))
  const v = FILE.split('_')[0]
  await c.query('INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [v, FILE.replace(/\.sql$/, '').replace(new RegExp(`^${v}_`), '')])

  const r1 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name='paid_amount'")
  console.log(`  ${r1.rows.length ? '✓' : '✗'} invoices.paid_amount`)
  const r2 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='financial_entries' AND column_name='invoice_id'")
  console.log(`  ${r2.rows.length ? '✓' : '✗'} financial_entries.invoice_id`)
  const r3 = await c.query("SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid WHERE t.relname='invoices' AND c.conname='invoices_status_check'")
  console.log(`  ${r3.rows[0]?.def?.includes('paid_partial') ? '✓' : '✗'} invoice status aceita paid_partial`)
  await c.end()
  console.log('✅ 0177 aplicada')
})().catch(e => { console.error('✗', e.message); process.exit(1) })
