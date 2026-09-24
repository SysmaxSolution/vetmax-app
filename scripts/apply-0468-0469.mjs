// Aplica as migrations 0468 (fluxo de rejeição de exame) e 0469 (RPC de absorção
// respeitando a trava de cobrança) no banco de DESENVOLVIMENTO.
// Credencial lida do .env.local (SUPABASE_DEV_DB_PASSWORD) — nunca hardcode.
import { readFileSync } from 'fs'; import pg from 'pg'; import { config } from 'dotenv'
import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d = dirname(fileURLToPath(import.meta.url)); config({ path: resolve(__d, '../.env.local') })

const files = ['0468_exam_rejection_flow.sql', '0469_absorb_respects_exam_hold.sql']
const cs = `postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(process.env.SUPABASE_DEV_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
await c.connect()
for (const f of files) {
  await c.query(readFileSync(resolve(__d, '../supabase/migrations/' + f), 'utf-8'))
  console.log('aplicada:', f)
}

const cols = await c.query(`SELECT column_name FROM information_schema.columns
  WHERE table_name='consultation_services' AND column_name LIKE 'exam_%' ORDER BY column_name`)
console.log('colunas novas em consultation_services:', cols.rows.map(r => r.column_name).join(', '))

const tbl = await c.query(`SELECT to_regclass('public.exam_rejection_reasons') AS t`)
console.log('exam_rejection_reasons:', tbl.rows[0].t ? 'criada' : 'FALHOU')

const fn = await c.query(`SELECT pg_get_functiondef(oid) LIKE '%exam_billing_hold_at%' AS ok
  FROM pg_proc WHERE proname='rpc_absorb_services_into_open_invoice'`)
console.log('RPC com trava de cobrança:', fn.rows[0]?.ok ? 'sim' : 'FALHOU')
await c.end()
