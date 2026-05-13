/**
 * Aplica migrations do catálogo global de produtos veterinários.
 * Usa pg diretamente para contornar conflitos de histórico do CLI.
 * Execute: node scripts/apply-catalog-migrations.js
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

// Decodifica URL do .env.local
const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim()

if (!dbUrl) {
  console.error('DATABASE_URL não encontrado em .env.local')
  process.exit(1)
}

// Parseia a URL mantendo password codificado para pg suportar chars especiais
// FORMAT: postgresql://user:password@host:port/db
const urlMatch = dbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
if (!urlMatch) {
  console.error('Formato de DATABASE_URL inválido:', dbUrl.substring(0, 50))
  process.exit(1)
}
const [, user, passwordEncoded, host, port, database] = urlMatch
const password = decodeURIComponent(passwordEncoded)

const migrations = [
  '0119_product_catalog_global.sql',
  '0120_product_catalog_seed_med.sql',
  '0121_product_catalog_seed_grooming.sql',
  '0122_product_catalog_seed_vaccines.sql',
  '0123_product_catalog_seed_aesthetics.sql',
]

async function run() {
  const client = new Client({
    user,
    password,
    host,
    port: parseInt(port),
    database,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  })

  try {
    console.log('Conectando ao banco...')
    await client.connect()
    console.log('Conexão estabelecida.')

    // Verifica se a tabela já existe
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'product_catalog_global'
      ) AS exists
    `)

    const tableExists = rows[0]?.exists

    if (tableExists) {
      const countRes = await client.query('SELECT COUNT(*) as cnt FROM product_catalog_global')
      const cnt = parseInt(countRes.rows[0]?.cnt ?? 0)
      if (cnt > 0) {
        console.log(`Tabela já existe com ${cnt} produtos. Nada a fazer.`)
        await client.end()
        return
      }
      console.log('Tabela existe mas vazia. Inserindo seeds...')
    } else {
      console.log('Tabela não existe. Aplicando migrations...')
    }

    const migrationsDir = path.join(__dirname, '../supabase/migrations')

    for (const file of migrations) {
      const filePath = path.join(migrationsDir, file)
      if (!fs.existsSync(filePath)) {
        console.log(`  ⚠ Arquivo não encontrado: ${file}`)
        continue
      }

      // Skip se tabela existe e é o arquivo de criação
      if (tableExists && file === '0119_product_catalog_global.sql') {
        console.log(`  ⏭ ${file} — tabela já existe, pulando DDL`)
        continue
      }

      const sql = fs.readFileSync(filePath, 'utf8')
      console.log(`  ▶ Aplicando ${file}...`)

      try {
        await client.query(sql)
        console.log(`  ✓ ${file} aplicado com sucesso.`)
      } catch (err) {
        if (err.code === '42P07') {
          console.log(`  ⚠ ${file} — objeto já existe (IF NOT EXISTS), continuando.`)
        } else if (err.code === '23505') {
          console.log(`  ⚠ ${file} — dado duplicado (${err.detail}), continuando.`)
        } else {
          console.error(`  ✗ Erro em ${file}:`, err.message)
          // Para seed files, continua mesmo com erros
          if (!file.includes('_seed_')) throw err
        }
      }
    }

    // Verifica resultado final
    const finalCount = await client.query('SELECT COUNT(*) as cnt FROM product_catalog_global')
    console.log(`\n✅ Concluído! Total de produtos no catálogo: ${finalCount.rows[0]?.cnt}`)

  } catch (err) {
    console.error('Erro fatal:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
