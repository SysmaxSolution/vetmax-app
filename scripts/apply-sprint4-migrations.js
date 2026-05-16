/**
 * Aplica migrations da Sprint 4 — Operação AlmaVet.
 * Execute: node scripts/apply-sprint4-migrations.js
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

const MIGRATIONS = ['0150_patients_whatsapp_trigger.sql']

async function run() {
  const client = new Client({
    user, password, host,
    port:     parseInt(port),
    database,
    ssl:      { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  })

  try {
    console.log('Conectando ao banco...')
    await client.connect()
    console.log('Conexão estabelecida.\n')

    const migrationsDir = path.join(__dirname, '../supabase/migrations')

    for (const file of MIGRATIONS) {
      const filePath = path.join(migrationsDir, file)
      if (!fs.existsSync(filePath)) {
        console.log(`  ⚠ Arquivo não encontrado: ${file}`)
        continue
      }

      const sql = fs.readFileSync(filePath, 'utf8')
      console.log(`  ▶ Aplicando ${file}...`)

      try {
        await client.query(sql)
        console.log(`  ✓ ${file} aplicado com sucesso.`)
      } catch (err) {
        if (err.code === '42710' || err.code === '42P07') {
          console.log(`  ⚠ ${file} — objeto já existe, pulando.`)
        } else {
          console.error(`  ✗ Erro em ${file}:`, err.message)
          throw err
        }
      }
    }

    // Verificar resultado
    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'profiles' AND column_name = 'mapa_code'
    `)
    console.log('\n─── Verificação ─────────────────────────────────')
    console.log(`  profiles.mapa_code: ${cols.length > 0 ? '✓ existe' : '✗ não encontrado'}`)

    const { rows: uc } = await client.query(`
      SELECT COUNT(*) AS cnt FROM information_schema.tables
      WHERE table_name = 'user_commissions'
    `)
    console.log(`  user_commissions:   ${uc[0]?.cnt > 0 ? '✓ existe' : '✗ não encontrado'}`)

    console.log('\n✅ Sprint 4 migrations aplicadas com sucesso!')
  } catch (err) {
    console.error('\n✗ Erro fatal:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
