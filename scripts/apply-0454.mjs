import { readFileSync } from 'fs'; import pg from 'pg'; import { config } from 'dotenv'
import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d=dirname(fileURLToPath(import.meta.url)); config({path:resolve(__d,'../.env.local')})
const sql=readFileSync(resolve(__d,'../supabase/migrations/0454_code_reveal_and_referral_professional.sql'),'utf-8')
const cs=`postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(process.env.SUPABASE_DEV_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c=new pg.Client({connectionString:cs,ssl:{rejectUnauthorized:false}}); await c.connect(); await c.query(sql)
const r=await c.query("SELECT table_name,column_name FROM information_schema.columns WHERE column_name IN ('access_code_enc','code_enc','referring_professional_id') AND table_name IN ('tutor_users','partner_clinics','partner_clinic_professionals','consultations') ORDER BY 1")
console.log('0454:', r.rows.map(x=>x.table_name+'.'+x.column_name).join(', ')); await c.end()
