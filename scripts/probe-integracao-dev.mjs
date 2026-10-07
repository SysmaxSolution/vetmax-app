// Sonda o banco DEV: quais objetos-chave das migrations da integração já existem
// e quais dados de demonstração as quatro frentes deixaram prontos.
// Credenciais SOMENTE via .env.local (SUPABASE_DEV_DB_PASSWORD) — nunca no código.
import pg from 'pg'; import { config } from 'dotenv'
import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d = dirname(fileURLToPath(import.meta.url)); config({ path: resolve(__d, '../.env.local') })
if (!process.env.SUPABASE_DEV_DB_PASSWORD) { console.error('SUPABASE_DEV_DB_PASSWORD ausente'); process.exit(1) }
const cs = `postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(process.env.SUPABASE_DEV_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } }); await c.connect()

const tables = ['clinic_fonts', 'clinic_document_identity', 'clinic_portal_themes', 'exam_result_graphs']
const cols = [
  ['patient_documents', 'canvas_state_snapshot'], ['patient_documents', 'snapshot_taken_at'],
  ['patient_documents', 'verify_code'], ['patient_documents', 'content_hash'],
  ['clinics', 'portal_slug'], ['clinic_settings', 'reports_enabled'],
  ['financial_entries', 'settled_by'], ['financial_entries', 'settled_at'],
]
const t = await c.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1) ORDER BY 1`, [tables])
console.log('0465/0467/0476/0485 tabelas presentes:', t.rows.map(r => r.table_name).join(', ') || '(nenhuma)')
for (const [tb, cl] of cols) {
  const r = await c.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [tb, cl])
  console.log(`  ${tb}.${cl}: ${r.rowCount ? 'OK' : 'AUSENTE'}`)
}
const ck = await c.query(
  `SELECT conname FROM pg_constraint WHERE conrelid='public.patient_documents'::regclass AND contype='c' AND conname LIKE '%verify%'`)
console.log('0486 check de integridade:', ck.rows.map(r => r.conname).join(', ') || '(ausente)')
const b = await c.query(`SELECT id FROM storage.buckets WHERE id IN ('clinic-fonts','exam-graphs') ORDER BY 1`)
console.log('buckets:', b.rows.map(r => r.id).join(', ') || '(nenhum)')

// ── Dados de demonstração por frente (multi-tenant: sempre por clinic_id) ────
const cl = await c.query(
  `SELECT id, name, portal_slug FROM clinics WHERE name ILIKE '%animais%' ORDER BY name`)
for (const r of cl.rows) {
  const tpl = await c.query(
    `SELECT count(*)::int AS n FROM document_templates WHERE clinic_id = $1`, [r.id])
  const doc = await c.query(
    `SELECT count(*)::int AS n FROM patient_documents WHERE clinic_id = $1 AND template_id IS NOT NULL`, [r.id])
  const gr = await c.query(
    `SELECT count(*)::int AS n FROM exam_result_graphs WHERE clinic_id = $1`, [r.id])
  console.log(`clínica "${r.name}" (${r.id}) slug=${r.portal_slug ?? '—'} | modelos Canvas: ${tpl.rows[0].n} | documentos emitidos: ${doc.rows[0].n} | gráficos de hemograma: ${gr.rows[0].n}`)
}
await c.end()
