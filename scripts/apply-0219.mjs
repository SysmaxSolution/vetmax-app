import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL.'); process.exit(1) }

const sql = readFileSync('supabase/migrations/0219_backfill_internal_chat_module.sql', 'utf-8')

const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  // Captura NOTICE do RAISE NOTICE pra logar o count
  c.on('notice', n => console.log('  ' + (n.message ?? n)))
  await c.query(sql)
  console.log('OK — 0219 aplicada no Supabase remoto')
} catch (e) {
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
