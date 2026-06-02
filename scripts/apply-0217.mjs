import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL.'); process.exit(1) }

const sql = readFileSync('supabase/migrations/0217_stock_item_insurance_providers.sql', 'utf-8')

const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  await c.query(sql)
  console.log('OK — 0217 aplicada no Supabase remoto')
} catch (e) {
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
