import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: '.env.local' })
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  for (const [ver, name] of [['0400', 'patient_vaccines_enhancements'], ['0401', 'visit_reason_acompanhamento']]) {
    const sql = readFileSync(`supabase/migrations/${ver}_${name}.sql`, 'utf-8')
    await c.query(sql)
    await c.query(
      'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [ver, name, [sql]]
    )
    console.log(`OK — ${ver} aplicada`)
  }
  const cols = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='patient_vaccines' AND column_name IN ('vaccine_type','dose_number','dose_total','manufacturer','lot_number','validity_date') ORDER BY column_name"
  )
  console.log('  colunas vacina:', cols.rows.map(r => r.column_name).join(', '))
} catch (e) { console.error('ERRO:', e.message); process.exit(1) }
finally { await c.end() }
