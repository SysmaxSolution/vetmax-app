import { readFileSync } from 'fs'; import pg from 'pg'; import { config } from 'dotenv'
import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d=dirname(fileURLToPath(import.meta.url)); config({path:resolve(__d,'../.env.local')})
const sql=readFileSync(resolve(__d,'../supabase/migrations/0453_partner_portal.sql'),'utf-8')
const cs=`postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(process.env.SUPABASE_DEV_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c=new pg.Client({connectionString:cs,ssl:{rejectUnauthorized:false}}); await c.connect(); await c.query(sql)
const t=await c.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('partner_clinic_professionals','partner_clinic_sessions')")
const col=await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='imaging_studies' AND column_name='referring_professional_id'")
console.log('0453 tabelas:', t.rows.map(r=>r.table_name).join(','), '| imaging col:', col.rows.length?'ok':'FALHOU'); await c.end()
