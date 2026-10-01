// Aplica a migration 0487 (curvas do analisador no Storage) no banco informado.
// Padrão: ambiente de TESTES (claqxwckiihknclhmzvf). Credenciais do .env.local.
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { config } from 'dotenv'

const __d = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__d, '../.env.local') })

const pwd = process.env.SUPABASE_DEV_DB_PASSWORD
if (!pwd) { console.error('Falta SUPABASE_DEV_DB_PASSWORD no .env.local'); process.exit(1) }

const host = process.env.SUPABASE_DEV_DB_HOST ?? 'aws-0-us-east-1.pooler.supabase.com'
const user = process.env.SUPABASE_DEV_DB_USER ?? 'postgres.claqxwckiihknclhmzvf'
const sql = readFileSync(resolve(__d, '../supabase/migrations/0487_exam_graphs_storage.sql'), 'utf-8')

const c = new pg.Client({
  host, port: Number(process.env.SUPABASE_DEV_DB_PORT ?? 6543), user,
  password: pwd, database: process.env.SUPABASE_DEV_DB_NAME ?? 'postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
console.log('Aplicando 0487 em', user.split('.')[1] ?? user, '...')
await c.query(sql)

const cols = await c.query(`
  SELECT column_name, is_nullable FROM information_schema.columns
   WHERE table_name='exam_result_graphs'
     AND column_name IN ('data','storage_path','bytes','width','height')
   ORDER BY column_name`)
const bucket = await c.query(`SELECT id, public, file_size_limit FROM storage.buckets WHERE id='exam-graphs'`)
console.log('colunas :', JSON.stringify(cols.rows))
console.log('bucket  :', JSON.stringify(bucket.rows))
await c.end()
