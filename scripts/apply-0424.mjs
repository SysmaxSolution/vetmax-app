// Aplica a migration 0424 no Supabase DEV via pooler (driver pg + senha do .env.local).
import pg from 'pg'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace(/^https:\/\//, '').split('.')[0]
const password = env.SUPABASE_DEV_DB_PASSWORD
if (!password) { console.error('SUPABASE_DEV_DB_PASSWORD ausente'); process.exit(2) }

const sql = readFileSync(new URL('../supabase/migrations/0424_animais_full_price_composition.sql', import.meta.url), 'utf8')

const client = new pg.Client({
  host: 'aws-0-us-east-1.pooler.supabase.com',
  port: 6543,
  user: `postgres.${ref}`,
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  await client.query(sql)
  console.log('✅ Migration 0424 aplicada no DEV.')
} catch (e) {
  console.error('❌ Falha:', e.message)
  process.exit(1)
} finally {
  await client.end()
}
