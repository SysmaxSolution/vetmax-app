// Aplica as migrations do motor de layouts v2 (0465+) no Supabase DEV.
// Uso: node scripts/apply-layouts-migrations.mjs [0465 0466 ...]
// Credenciais SOMENTE via .env.local (SUPABASE_DEV_DB_PASSWORD) — nunca no código.
import { readFileSync, readdirSync } from 'fs'; import pg from 'pg'; import { config } from 'dotenv'
import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d = dirname(fileURLToPath(import.meta.url)); config({ path: resolve(__d, '../.env.local') })
if (!process.env.SUPABASE_DEV_DB_PASSWORD) { console.error('SUPABASE_DEV_DB_PASSWORD ausente no .env.local'); process.exit(1) }
const wanted = process.argv.slice(2)
const dir = resolve(__d, '../supabase/migrations')
const files = readdirSync(dir).filter(f => /^\d{4}_.+\.sql$/.test(f) && (wanted.length ? wanted.some(p => f.startsWith(p)) : Number(f.slice(0, 4)) >= 465)).sort()
const cs = `postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(process.env.SUPABASE_DEV_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } }); await c.connect()
for (const f of files) {
  process.stdout.write(`→ ${f} … `)
  try { await c.query(readFileSync(resolve(dir, f), 'utf-8')); console.log('OK') }
  catch (e) { console.log('ERRO'); console.error(e.message); await c.end(); process.exit(1) }
}
const r = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('clinic_fonts','clinic_document_identity') ORDER BY 1`)
const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='patient_documents' AND column_name IN ('canvas_state_snapshot','snapshot_taken_at')`)
const b = await c.query(`SELECT id FROM storage.buckets WHERE id='clinic-fonts'`)
console.log('tabelas:', r.rows.map(x => x.table_name).join(', ') || '(nenhuma)', '| colunas snapshot:', cols.rows.map(x => x.column_name).join(', ') || '(nenhuma)', '| bucket clinic-fonts:', b.rows.length ? 'OK' : 'ausente')
await c.end()
