import { readFileSync } from 'fs'
import pg from 'pg'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const sql = readFileSync(resolve(__dirname, '../supabase/migrations/0447_tutor_portal_identity.sql'), 'utf-8')
const pwd = process.env.SUPABASE_DEV_DB_PASSWORD
if (!pwd) { console.error('SUPABASE_DEV_DB_PASSWORD não encontrada'); process.exit(1) }

const connectionString = `postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(pwd)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log('Conectado ao DEV. Aplicando migration 0447...')
await client.query(sql)
const t = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('tutor_users','tutor_user_links','tutor_login_tokens','tutor_sessions') ORDER BY table_name`)
console.log('Tabelas:', t.rows.map(r => r.table_name).join(', '))
await client.end()
