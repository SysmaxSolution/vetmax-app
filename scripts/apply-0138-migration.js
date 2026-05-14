// Aplica migration 0138 (Pixel Perfect) diretamente via DATABASE_URL
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
  console.error('DATABASE_URL nao encontrada em .env.local')
  process.exit(1)
}

const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '0138_document_templates_pixel_perfect.sql')
const sql = fs.readFileSync(sqlPath, 'utf-8')

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    console.log('[migration 0138] conectado')
    await client.query(sql)
    console.log('[migration 0138] aplicada com sucesso')

    const check = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'document_templates'
        AND column_name IN ('original_pdf_path','page_dimensions','layout_overlays','page_count','page_images_storage_paths')
      ORDER BY column_name
    `)
    console.log('[migration 0138] colunas em document_templates:')
    check.rows.forEach(r => console.log('  -', r.column_name, '(' + r.data_type + ')'))

    const buckets = await client.query(`
      SELECT id, public, file_size_limit
      FROM storage.buckets
      WHERE id IN ('document-templates','patient-documents')
      ORDER BY id
    `)
    console.log('[migration 0138] buckets:')
    buckets.rows.forEach(b => console.log('  -', b.id, 'public=' + b.public, 'max=' + b.file_size_limit))
  } catch (e) {
    console.error('[migration 0138] erro:', e.message)
    process.exit(1)
  } finally {
    await client.end()
  }
})()
