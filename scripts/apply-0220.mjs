import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL.'); process.exit(1) }

const sql = readFileSync('supabase/migrations/0220_clinic_layout_version.sql', 'utf-8')

const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  c.on('notice', n => console.log('  ' + (n.message ?? n)))
  await c.query(sql)
  const r = await c.query("SELECT count(*) AS total, count(*) FILTER (WHERE layout_version='classic') AS classic FROM clinics")
  console.log('OK — 0220 aplicada. Clínicas:', r.rows[0])
} catch (e) {
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
