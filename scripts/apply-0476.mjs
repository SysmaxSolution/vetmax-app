// Aplica a migration 0476 (white-label do Portal do Tutor) no banco de DEV.
// Credenciais SEMPRE do .env.local — nada hardcoded.
import { readFileSync } from 'fs'; import pg from 'pg'; import { config } from 'dotenv'
import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d = dirname(fileURLToPath(import.meta.url)); config({ path: resolve(__d, '../.env.local') })
if (!process.env.SUPABASE_DEV_DB_PASSWORD) { console.error('Falta SUPABASE_DEV_DB_PASSWORD no .env.local'); process.exit(1) }

const sql = readFileSync(resolve(__d, '../supabase/migrations/0476_portal_white_label.sql'), 'utf-8')
const cs = `postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(process.env.SUPABASE_DEV_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } }); await c.connect()

await c.query(sql)

const col = await c.query(`SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='clinics' AND column_name='portal_slug'`)
const tbl = await c.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_portal_themes'`)
const rls = await c.query(`SELECT relrowsecurity FROM pg_class WHERE relname='clinic_portal_themes'`)
const pol = await c.query(`SELECT policyname FROM pg_policies WHERE tablename='clinic_portal_themes'`)
const slugs = await c.query(`SELECT name, portal_slug FROM clinics ORDER BY name`)
const nulls = await c.query(`SELECT count(*)::int AS n FROM clinics WHERE portal_slug IS NULL`)
const dups = await c.query(`SELECT portal_slug, count(*)::int AS n FROM clinics WHERE portal_slug IS NOT NULL GROUP BY 1 HAVING count(*) > 1`)

console.log('0476 — clinics.portal_slug:', col.rows.length ? col.rows[0].data_type : 'FALHOU')
console.log('0476 — clinic_portal_themes:', tbl.rows[0].n, 'colunas | RLS:', rls.rows[0]?.relrowsecurity, '| policy:', pol.rows.map(r => r.policyname).join(',') || 'NENHUMA')
console.log('0476 — slugs gerados:')
for (const r of slugs.rows) console.log(`   ${String(r.portal_slug).padEnd(40)} ← ${r.name}`)
console.log('0476 — clínicas sem slug:', nulls.rows[0].n, '| slugs duplicados:', dups.rows.length)

await c.query(
  `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
  ['0476', 'portal_white_label'],
).catch(e => console.log('  (histórico não registrado:', e.message, ')'))

await c.end()
const ok = col.rows.length > 0 && tbl.rows[0].n > 0 && rls.rows[0]?.relrowsecurity && pol.rows.length > 0
             && nulls.rows[0].n === 0 && dups.rows.length === 0
process.exit(ok ? 0 : 1)
