/**
 * Sprint 1 — Conciliação Petlove
 * Aplica migrations 0160–0163 diretamente via psql, contornando conflitos
 * de prefixo duplicado no histórico do supabase CLI.
 *
 * Execute: node scripts/apply-petlove-migrations.js
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

const MIGRATIONS = [
  '0160_invoice_items_insurance_status.sql',
  '0161_petlove_remittances.sql',
  '0162_petlove_remittance_lines.sql',
  '0163_petlove_procedure_mapping.sql',
  '0164_patients_tutors_created_from.sql',
  '0165_financial_entries_petlove_source.sql',
  '0166_patient_custom_prices.sql',
  '0167_petlove_match_status_fix.sql',
  '0168_patient_petlove_history.sql',
]

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

    const migrationsDir = path.join(__dirname, '../supabase/migrations')

    for (const file of MIGRATIONS) {
      const version = file.split('_')[0]
      const filePath = path.join(migrationsDir, file)
      if (!fs.existsSync(filePath)) {
        console.log(`  ⚠ Arquivo não encontrado: ${file}`)
        continue
      }
      const sql = fs.readFileSync(filePath, 'utf8')
      console.log(`  ▶ Aplicando ${file}...`)

      try {
        await client.query(sql)
        console.log(`  ✓ ${file} executado.`)
      } catch (err) {
        if (err.code === '42710' || err.code === '42P07' || err.code === '42701') {
          console.log(`  ⚠ ${file} — objeto já existe, pulando.`)
        } else {
          console.error(`  ✗ Erro em ${file}:`, err.message)
          throw err
        }
      }

      try {
        await client.query(
          'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
          [version, file.replace(/\.sql$/, '').replace(new RegExp(`^${version}_`), '')]
        )
        console.log(`  ✓ ${version} registrado em schema_migrations.\n`)
      } catch (err) {
        console.log(`  ⚠ Não foi possível registrar ${version} em schema_migrations: ${err.message}\n`)
      }
    }

    console.log('─── Verificação ─────────────────────────────────')
    const checks = [
      { sql: `SELECT column_name FROM information_schema.columns WHERE table_name='invoice_items' AND column_name='insurance_status'`, label: 'invoice_items.insurance_status' },
      { sql: `SELECT table_name FROM information_schema.tables WHERE table_name='petlove_remittances'`, label: 'tabela petlove_remittances' },
      { sql: `SELECT table_name FROM information_schema.tables WHERE table_name='petlove_remittance_lines'`, label: 'tabela petlove_remittance_lines' },
      { sql: `SELECT table_name FROM information_schema.tables WHERE table_name='petlove_procedure_mappings'`, label: 'tabela petlove_procedure_mappings' },
    ]
    for (const c of checks) {
      const { rows } = await client.query(c.sql)
      console.log(`  ${rows.length > 0 ? '✓' : '✗'} ${c.label}`)
    }

    console.log('\n✅ Migrations Sprint 1 (Petlove) aplicadas com sucesso!')
  } catch (err) {
    console.error('\n✗ Erro fatal:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
