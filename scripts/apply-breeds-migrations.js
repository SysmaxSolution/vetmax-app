// Aplica migrations 0158 (catalog) e 0159 (seed + backfill) via DATABASE_URL
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const idx = line.indexOf('=')
  if (idx > 0) {
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key && value) envVars[key] = value
  }
})

const url = envVars.DATABASE_URL || envVars.POSTGRES_URL || envVars.POSTGRES_URL_NON_POOLING
if (!url) {
  console.error('DATABASE_URL não encontrada em .env.local')
  process.exit(1)
}

const migrations = [
  '0158_breeds_catalog.sql',
  '0159_breeds_seed_and_backfill.sql',
]

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    console.log('[breeds] conectado')

    for (const file of migrations) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', file), 'utf-8')
      console.log(`\n[breeds] aplicando ${file}…`)
      await client.query(sql)
      console.log(`[breeds] ${file} aplicada`)
    }

    // Verificações
    const cols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'breeds' AND table_schema = 'public'
      ORDER BY ordinal_position
    `)
    console.log('\n[breeds] colunas:')
    cols.rows.forEach(c => console.log('  -', c.column_name, '(' + c.data_type + ')'))

    const counts = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE clinic_id IS NULL)     AS globals,
        COUNT(*) FILTER (WHERE clinic_id IS NOT NULL) AS per_clinic,
        COUNT(*)                                      AS total
      FROM public.breeds
    `)
    const r = counts.rows[0]
    console.log(`\n[breeds] contagem: globais=${r.globals}, por_clinic=${r.per_clinic}, total=${r.total}`)

    const bySpecies = await client.query(`
      SELECT species, COUNT(*) AS n
      FROM public.breeds WHERE clinic_id IS NULL
      GROUP BY species ORDER BY species
    `)
    console.log('[breeds] globais por espécie:')
    bySpecies.rows.forEach(b => console.log(`  - ${b.species}: ${b.n}`))
  } catch (e) {
    console.error('[breeds] ERRO:', e.message)
    if (e.detail)   console.error('  detail: ', e.detail)
    if (e.hint)     console.error('  hint:   ', e.hint)
    if (e.position) console.error('  position:', e.position)
    process.exit(1)
  } finally {
    await client.end()
  }
})()
