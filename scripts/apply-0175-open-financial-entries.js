/**
 * Migration 0175 — contas a receber em aberto da prévia Petlove.
 * Execute: node scripts/apply-0175-open-financial-entries.js
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim()
if (!dbUrl) { console.error('DATABASE_URL não encontrado'); process.exit(1) }

const urlMatch = dbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
const [, user, passwordEncoded, host, port, database] = urlMatch
const password = decodeURIComponent(passwordEncoded)

const FILE = '0175_petlove_open_financial_entries.sql'

async function run() {
  const client = new Client({
    user, password, host,
    port: parseInt(port),
    database,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  })

  try {
    await client.connect()
    console.log('Conectado.\n')

    const filePath = path.join(__dirname, '..', 'supabase', 'migrations', FILE)
    const sql = fs.readFileSync(filePath, 'utf8')

    console.log(`▶ Aplicando ${FILE}...`)
    await client.query(sql)
    console.log(`  ✓ executado.\n`)

    const version = FILE.split('_')[0]
    await client.query(
      'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [version, FILE.replace(/\.sql$/, '').replace(new RegExp(`^${version}_`), '')]
    )

    console.log('─── Verificação ─────────────────────────────────')
    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='financial_entries' AND column_name='petlove_remittance_line_id'
    `)
    console.log(`  ${cols.length > 0 ? '✓' : '✗'} coluna financial_entries.petlove_remittance_line_id`)

    const { rows: chk } = await client.query(`
      SELECT pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'financial_entries' AND c.conname = 'financial_entries_source_check'
    `)
    console.log(`  ${chk[0]?.def?.includes("'petlove_open'") ? '✓' : '✗'} source aceita 'petlove_open'`)

    console.log('\n✅ Migration 0175 aplicada.')
  } catch (err) {
    console.error('\n✗', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
