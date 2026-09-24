import { readFileSync } from 'fs'; import pg from 'pg'; import { config } from 'dotenv'
import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d = dirname(fileURLToPath(import.meta.url)); config({ path: resolve(__d, '../.env.local') })
const sql = readFileSync(resolve(__d, '../supabase/migrations/0451_vaccine_portal_recall.sql'), 'utf-8')
const cs = `postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(process.env.SUPABASE_DEV_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c = new pg.Client({ connectionString: cs, ssl:{rejectUnauthorized:false} }); await c.connect(); await c.query(sql)
const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='patient_vaccines' AND column_name='portal_recall_sent_at'")
console.log('0451:', r.rows.length?'OK':'FALHOU'); await c.end()
