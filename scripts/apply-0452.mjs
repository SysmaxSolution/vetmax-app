import { readFileSync } from 'fs'; import pg from 'pg'; import { config } from 'dotenv'
import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d=dirname(fileURLToPath(import.meta.url)); config({path:resolve(__d,'../.env.local')})
const sql=readFileSync(resolve(__d,'../supabase/migrations/0452_tutor_access_code.sql'),'utf-8')
const cs=`postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(process.env.SUPABASE_DEV_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c=new pg.Client({connectionString:cs,ssl:{rejectUnauthorized:false}}); await c.connect(); await c.query(sql)
const r=await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='tutor_users' AND column_name IN ('access_code_hash','code_locked_until')")
console.log('0452:', r.rows.length===2?'OK':'FALHOU'); await c.end()
