// scripts/migrate.js — VetMax Migration Runner
// Usa a Supabase Management API com Personal Access Token
// Requer: SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF no .env.local

const https = require('https')
const fs = require('fs')
const path = require('path')

function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local')
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

function apiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function runSQL(sql, token, ref) {
  const res = await apiRequest(
    'POST',
    `/v1/projects/${ref}/database/query`,
    { query: sql },
    token
  )
  if (res.status < 200 || res.status >= 300) {
    const msg = res.body?.message || res.body?.error || JSON.stringify(res.body)
    throw new Error(msg)
  }
  return res.body
}

async function main() {
  loadEnv()

  const token = process.env.SUPABASE_ACCESS_TOKEN
  const ref   = process.env.SUPABASE_PROJECT_REF

  if (!token) { console.error('❌  SUPABASE_ACCESS_TOKEN não encontrado'); process.exit(1) }
  if (!ref)   { console.error('❌  SUPABASE_PROJECT_REF não encontrado');   process.exit(1) }

  // Tabela de controle de migrations
  await runSQL(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ DEFAULT now()
    )
  `, token, ref)

  const rows = await runSQL('SELECT name FROM _migrations ORDER BY name', token, ref)
  const applied = new Set((rows ?? []).map(r => r.name))

  const migrationsDir = path.join(__dirname, '../supabase/migrations')
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  let ran = 0

  for (const file of files) {
    if (applied.has(file)) { console.log(`⏭  ${file}  (já aplicada)`); continue }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    try {
      await runSQL(sql, token, ref)
      await runSQL(`INSERT INTO _migrations (name) VALUES ('${file.replace(/'/g, "''")}')`, token, ref)
      console.log(`✓   ${file}`)
      ran++
    } catch (err) {
      const alreadyExists = /already exists|already been done|duplicate|is violated by some row/i.test(err.message)
      if (alreadyExists) {
        await runSQL(`INSERT INTO _migrations (name) VALUES ('${file.replace(/'/g, "''")}') ON CONFLICT DO NOTHING`, token, ref)
        console.log(`⚠   ${file}  (objetos já existem — registrada como aplicada)`)
      } else {
        console.error(`\n✗   ${file}\n    ${err.message}`)
        process.exit(1)
      }
    }
  }

  if (ran === 0) console.log('ℹ   Nenhuma migration pendente.')
  else console.log(`\n✅  ${ran} migration(s) aplicada(s) com sucesso.`)
}

main().catch(err => { console.error(err); process.exit(1) })
