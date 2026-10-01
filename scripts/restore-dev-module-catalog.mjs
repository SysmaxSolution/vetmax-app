// Recompõe `subscription_module_catalog` no ambiente de DEV a partir da PRODUÇÃO.
//
// Por quê: o dump que criou o dev veio sem as linhas desta tabela (0 no dev × 16 na prod).
// Sem ela o gatekeeper só libera os módulos do FREE, e qualquer clínica de teste que não
// seja a SysMax Suporte cai no paywall — distorce todo teste de plano feito no dev.
//
// Produção é lida SOMENTE por Management API (nenhuma escrita). A escrita acontece
// exclusivamente no projeto de dev, e há trava para impedir inversão de alvo.
//
//   node scripts/restore-dev-module-catalog.mjs            (dry-run: só mostra o plano)
//   node scripts/restore-dev-module-catalog.mjs --apply    (grava no dev)

import fs from 'node:fs'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const PROD_REF = 'yivjuhurcadxtllmkkqd'
const DEV_REF = 'claqxwckiihknclhmzvf'

// Credenciais sempre do ambiente/.env.local — nunca no código.
for (const file of ['C:/SysMax/.env.local', 'C:/sysvetmax-treino/.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const DEV_PASS = process.env.SUPABASE_DEV_DB_PASSWORD
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN ausente (leitura da produção).')
if (!DEV_PASS) throw new Error('SUPABASE_DEV_DB_PASSWORD ausente (escrita no dev).')

async function prodQuery(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`produção respondeu ${r.status}: ${t.slice(0, 200)}`)
  return JSON.parse(t)
}

const COLS = [
  'module_key', 'label', 'description', 'monthly_price', 'is_available',
  'sort_order', 'included_module_keys', 'flow_flags', 'included_in_plan',
]

const rows = await prodQuery(`select ${COLS.join(', ')} from subscription_module_catalog order by sort_order, module_key`)
console.log(`PRODUÇÃO (somente leitura): ${rows.length} módulos no catálogo.`)

const client = new pg.Client({
  connectionString: `postgresql://postgres.${DEV_REF}:${encodeURIComponent(DEV_PASS)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// Trava dura: só escreve se o alvo for mesmo o projeto de dev.
const who = await client.query('select current_database() db, current_user usr')
const conn = client.connectionParameters?.user ?? ''
if (!conn.includes(DEV_REF)) {
  await client.end()
  throw new Error(`ALVO INESPERADO (${conn}) — este script só escreve no dev ${DEV_REF}.`)
}
console.log(`DEV alvo: ${who.rows[0].db} como ${conn.split('.')[0]}.${DEV_REF}`)

const before = await client.query('select count(*)::int n from subscription_module_catalog')
console.log(`DEV antes: ${before.rows[0].n} linhas.`)

if (!APPLY) {
  console.log('\n[dry-run] Seriam inseridos/atualizados:')
  for (const r of rows) console.log(`  ${String(r.module_key).padEnd(22)} ${String(r.included_in_plan ?? '-').padEnd(11)} → ${JSON.stringify(r.included_module_keys)}`)
  console.log('\nRode de novo com --apply para gravar.')
  await client.end()
  process.exit(0)
}

let gravados = 0
for (const r of rows) {
  await client.query(
    `insert into subscription_module_catalog
       (${COLS.join(', ')})
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (module_key) do update set
       label = excluded.label, description = excluded.description,
       monthly_price = excluded.monthly_price, is_available = excluded.is_available,
       sort_order = excluded.sort_order, included_module_keys = excluded.included_module_keys,
       flow_flags = excluded.flow_flags, included_in_plan = excluded.included_in_plan,
       updated_at = now()`,
    COLS.map(c => r[c]),
  )
  gravados++
}

const after = await client.query('select count(*)::int n from subscription_module_catalog')
const check = await client.query('select module_key, included_in_plan from subscription_module_catalog order by sort_order, module_key')
await client.end()

console.log(`\n✓ ${gravados} módulos gravados. DEV agora: ${after.rows[0].n} linhas.`)
for (const r of check.rows) console.log(`  ${String(r.module_key).padEnd(22)} ${r.included_in_plan ?? '-'}`)
