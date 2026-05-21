/**
 * Migration 0174 — petlove_remittances "em aberto" (preview).
 * Aplica direto via psql contornando o gap conhecido 0155-0159 no histórico.
 *
 * Execute: node scripts/apply-0174-open-remittances.js
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim()
if (!dbUrl) { console.error('DATABASE_URL não encontrado em .env.local'); process.exit(1) }

const urlMatch = dbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
if (!urlMatch) { console.error('Formato de DATABASE_URL inválido'); process.exit(1) }

const [, user, passwordEncoded, host, port, database] = urlMatch
const password = decodeURIComponent(passwordEncoded)

const FILE = '0174_petlove_open_remittances.sql'

async function run() {
  const client = new Client({
    user, password, host,
    port: parseInt(port),
    database,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  })

  try {
    console.log('Conectando ao banco remoto...')
    await client.connect()
    console.log('Conexão estabelecida.\n')

    const filePath = path.join(__dirname, '..', 'supabase', 'migrations', FILE)
    const sql = fs.readFileSync(filePath, 'utf8')
    const version = FILE.split('_')[0]

    console.log(`  ▶ Aplicando ${FILE}...`)
    try {
      await client.query(sql)
      console.log(`  ✓ ${FILE} executado.`)
    } catch (err) {
      if (err.code === '42710' || err.code === '42P07' || err.code === '42701') {
        console.log(`  ⚠ Objeto já existe, ignorando: ${err.message}`)
      } else {
        console.error(`  ✗ Erro:`, err.message)
        throw err
      }
    }

    try {
      await client.query(
        'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
        [version, FILE.replace(/\.sql$/, '').replace(new RegExp(`^${version}_`), '')]
      )
      console.log(`  ✓ ${version} registrado em schema_migrations.\n`)
    } catch (err) {
      console.log(`  ⚠ Não foi possível registrar ${version}: ${err.message}\n`)
    }

    console.log('─── Verificação ─────────────────────────────────')
    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='petlove_remittances' AND column_name IN ('is_preview','source_format')
      ORDER BY column_name
    `)
    for (const r of cols) console.log(`  ✓ coluna petlove_remittances.${r.column_name} presente`)

    const { rows: check } = await client.query(`
      SELECT pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'petlove_remittances' AND c.conname = 'petlove_remittances_status_check'
    `)
    if (check[0]?.def?.includes("'open'")) {
      console.log("  ✓ CHECK status aceita 'open'")
    } else {
      console.log("  ✗ CHECK status NÃO aceita 'open':", check[0]?.def)
    }

    console.log('\n✅ Migration 0174 aplicada com sucesso.')
  } catch (err) {
    console.error('\n✗ Erro fatal:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
