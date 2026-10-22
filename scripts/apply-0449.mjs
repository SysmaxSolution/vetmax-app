import { readFileSync } from 'fs'
import pg from 'pg'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })
const sql = readFileSync(resolve(__dirname, '../supabase/migrations/0449_catalog_portal_and_duration.sql'), 'utf-8')
const pwd = process.env.SUPABASE_DEV_DB_PASSWORD
const cs = `postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(pwd)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
await c.connect(); console.log('Aplicando 0449...'); await c.query(sql)
const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='clinic_catalog' AND column_name IN ('publish_to_portal','expected_duration_minutes') ORDER BY column_name`)
console.log('Colunas:', r.rows.map(x=>x.column_name).join(', ')); await c.end()
