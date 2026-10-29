// Aplica a migration 0475 (clinic_settings.reports_enabled) no banco de DEV.
// Credenciais SEMPRE do .env.local — nada hardcoded.
import { readFileSync } from 'fs'; import pg from 'pg'; import { config } from 'dotenv'
import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d = dirname(fileURLToPath(import.meta.url)); config({ path: resolve(__d, '../.env.local') })
if (!process.env.SUPABASE_DEV_DB_PASSWORD) { console.error('Falta SUPABASE_DEV_DB_PASSWORD no .env.local'); process.exit(1) }
const sql = readFileSync(resolve(__d, '../supabase/migrations/0475_clinic_settings_reports_enabled.sql'), 'utf-8')
const cs = `postgresql://postgres.claqxwckiihknclhmzvf:${encodeURIComponent(process.env.SUPABASE_DEV_DB_PASSWORD)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } }); await c.connect()
await c.query(sql)
const r = await c.query(`SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_settings' AND column_name='reports_enabled'`)
console.log('0475:', r.rows.length ? `coluna criada (${r.rows[0].data_type}, nullable=${r.rows[0].is_nullable}, default=${r.rows[0].column_default ?? 'NULL'})` : 'FALHOU')
// registra no histórico, na mesma conexão (ver project_migrations_gap_resolved)
await c.query(
  `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
  ['0475', 'clinic_settings_reports_enabled'],
).catch(e => console.log('  (histórico não registrado:', e.message, ')'))
await c.end()
process.exit(r.rows.length ? 0 : 1)
