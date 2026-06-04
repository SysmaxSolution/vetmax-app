// find-duplicate-stock-items.mjs
// Diagnóstico B3: lista stock_items com nome normalizado duplicado por
// clínica — SEM filtro de is_service e incluindo arquivados (--all).
//
// Uso:
//   node scripts/find-duplicate-stock-items.mjs            # ativos
//   node scripts/find-duplicate-stock-items.mjs --all      # inclui arquivados

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim()
const m = dbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
const [, user, pw, host, port, db] = m

const ALL = process.argv.includes('--all')

function normalizeServiceName(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const client = new pg.Client({
  user, password: decodeURIComponent(pw), host, port: +port, database: db,
  ssl: { rejectUnauthorized: false },
})

;(async () => {
  await client.connect()
  const { rows } = await client.query(
    `SELECT s.id, s.clinic_id, c.name AS clinic_name, s.name, s.category, s.is_service,
            s.unit_price, s.default_insurance_price, s.archived_at, s.created_at
       FROM stock_items s
       JOIN clinics c ON c.id = s.clinic_id
      ${ALL ? '' : 'WHERE s.archived_at IS NULL'}
      ORDER BY s.clinic_id, s.created_at ASC`,
  )
  const groups = new Map()
  for (const r of rows) {
    const key = `${r.clinic_id}::${normalizeServiceName(r.name)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const dups = [...groups.values()].filter(g => g.length > 1)
  if (dups.length === 0) {
    console.log(`Nenhuma duplicata (${ALL ? 'incluindo arquivados' : 'ativos'}). Total de itens: ${rows.length}`)
  } else {
    console.log(`${dups.length} grupo(s):\n`)
    for (const g of dups) {
      console.log(`▸ ${g[0].clinic_name} (${g[0].clinic_id})`)
      for (const it of g) {
        console.log(`   ${it.id} "${it.name}" cat=${it.category} svc=${it.is_service} unit=${it.unit_price} conv=${it.default_insurance_price ?? '—'} ${it.archived_at ? 'ARQUIVADO' : ''} ${it.created_at.toISOString().slice(0,10)}`)
      }
    }
  }
  await client.end()
})().catch(err => { console.error(err); process.exit(1) })
