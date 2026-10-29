// Migração dos DADOS das curvas do analisador: base64 no banco → PNG binário
// no bucket privado `exam-graphs` (migration 0487).
//
// Por quê: cada hemograma guardava ~44 kB de base64 em exam_result_graphs.data,
// e toda abertura do laudo arrastava isso do Postgres pela função serverless —
// o tráfego que a Vercel cobra como fast origin transfer e que bloqueou a conta.
//
// IDEMPOTENTE: só olha linhas com data preenchido e storage_path nulo. Rodar
// duas vezes não duplica nem reprocessa. O caminho no Storage é determinístico
// ({clinic_id}/{consultation_id}/{curva}.ext), então o upload é upsert.
//
// SEGURO: o `data` só é apagado depois de o objeto ser lido de volta do Storage
// e o tamanho conferir. Com --keep-base64 o base64 fica onde está (o leitor
// prefere o Storage de todo jeito) — útil para um primeiro passe conservador.
//
// Uso:
//   node scripts/migrate-exam-graphs-to-storage.mjs --dry
//   node scripts/migrate-exam-graphs-to-storage.mjs
//   node scripts/migrate-exam-graphs-to-storage.mjs --clinic <uuid>
//   node scripts/migrate-exam-graphs-to-storage.mjs --keep-base64
//
// Credenciais: .env.local do worktree (SUPABASE_DEV_DB_PASSWORD +
// SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL). Nunca hardcode.

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __d = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__d, '../.env.local') })

const argv = process.argv.slice(2)
const argValue = n => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? null) : null }
const DRY = argv.includes('--dry')
const KEEP = argv.includes('--keep-base64')
const CLINIC = argValue('--clinic')
const BATCH = Number(argValue('--batch') ?? 50)

const BUCKET = 'exam-graphs'

// ── Credenciais ──────────────────────────────────────────────────────────────
const pwd = process.env.SUPABASE_DEV_DB_PASSWORD
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!pwd) { console.error('Falta SUPABASE_DEV_DB_PASSWORD no .env.local'); process.exit(1) }
if (!url || !key) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local'); process.exit(1) }

const db = new pg.Client({
  host:     process.env.SUPABASE_DEV_DB_HOST ?? 'aws-0-us-east-1.pooler.supabase.com',
  port:     Number(process.env.SUPABASE_DEV_DB_PORT ?? 6543),
  user:     process.env.SUPABASE_DEV_DB_USER ?? 'postgres.claqxwckiihknclhmzvf',
  password: pwd,
  database: process.env.SUPABASE_DEV_DB_NAME ?? 'postgres',
  ssl: { rejectUnauthorized: false },
})
const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET)

// ── Cópia mínima da lógica pura de src/lib/lab/graph-storage.ts ──────────────
// (o script roda fora do bundle do Next, sem o alias @/; a versão testada por
//  Jest é a de src — esta é só o espelho necessário para o passe de dados)
const EXT = { 'image/png': 'png', 'image/bmp': 'bmp', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
const extForMime = m => EXT[String(m ?? '').toLowerCase()] ?? 'bin'

function sniff(bytes) {
  const b = bytes
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  return null
}
function pngDims(b) {
  if (b.length < 24 || b.toString('ascii', 12, 16) !== 'IHDR') return { width: null, height: null }
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}
const slug = c => (String(c ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'curva')
const objectPath = (clinic, cons, code, mime) => `${clinic}/${cons}/${slug(code)}.${extForMime(mime)}`

// ── Passe ────────────────────────────────────────────────────────────────────
await db.connect()

const where = ['data IS NOT NULL', 'storage_path IS NULL']
const params = []
if (CLINIC) { params.push(CLINIC); where.push(`clinic_id = $${params.length}`) }

const total = await db.query(
  `SELECT count(*)::int AS n, coalesce(sum(length(data)),0)::bigint AS chars
     FROM exam_result_graphs WHERE ${where.join(' AND ')}`, params)
console.log(`Pendentes: ${total.rows[0].n} curva(s) · ${(Number(total.rows[0].chars) / 1024).toFixed(1)} kB de base64 no banco`)
if (DRY) { console.log('(--dry: nada foi gravado)'); await db.end(); process.exit(0) }

let ok = 0, falhou = 0, pulou = 0, bytesSubidos = 0, charsLiberados = 0

for (;;) {
  const page = await db.query(
    `SELECT id, clinic_id, consultation_id, code, mime, encoding, data
       FROM exam_result_graphs WHERE ${where.join(' AND ')}
      ORDER BY created_at LIMIT ${BATCH}`, params)
  if (page.rows.length === 0) break

  for (const row of page.rows) {
    const enc = String(row.encoding ?? 'Base64').toLowerCase()
    if (enc !== 'base64') {
      console.log(`  - ${row.id} pulada (encoding=${row.encoding})`); pulou++
      // Marca para não entrar na próxima página (evita laço infinito).
      await db.query(`UPDATE exam_result_graphs SET bytes = length(data) WHERE id = $1 AND storage_path IS NULL`, [row.id])
      continue
    }
    const clean = String(row.data).replace(/[\s\r\n]+/g, '')
    let bytes
    try { bytes = Buffer.from(clean, 'base64') } catch { bytes = null }
    const mime = bytes && bytes.length ? (sniff(bytes) ?? null) : null
    if (!bytes || !bytes.length || !mime) {
      console.log(`  ! ${row.id} (${row.code}) não é imagem reconhecível — fica como está`); pulou++
      await db.query(`UPDATE exam_result_graphs SET bytes = length(data) WHERE id = $1 AND storage_path IS NULL`, [row.id])
      continue
    }

    const path = objectPath(row.clinic_id, row.consultation_id, row.code, mime)
    const up = await storage.upload(path, bytes, { contentType: mime, upsert: true, cacheControl: '31536000' })
    if (up.error) { console.error(`  ! ${row.id} (${row.code}) upload falhou: ${up.error.message}`); falhou++; continue }

    // Confere lendo de volta antes de abrir mão do base64.
    const back = await storage.download(path)
    const backLen = back.data ? (await back.data.arrayBuffer()).byteLength : -1
    if (backLen !== bytes.length) {
      console.error(`  ! ${row.id} (${row.code}) leitura de volta divergiu (${backLen} ≠ ${bytes.length}) — base64 preservado`)
      falhou++
      continue
    }

    const { width, height } = mime === 'image/png' ? pngDims(bytes) : { width: null, height: null }
    const charsAntes = String(row.data).length
    await db.query(
      `UPDATE exam_result_graphs
          SET storage_path = $2, mime = $3, encoding = 'binary',
              bytes = $4, width = $5, height = $6,
              data = CASE WHEN $7::boolean THEN data ELSE NULL END
        WHERE id = $1`,
      [row.id, path, mime, bytes.length, width, height, KEEP])
    ok++
    bytesSubidos += bytes.length
    if (!KEEP) charsLiberados += charsAntes
  }
}

console.log('')
console.log(`Movidas  : ${ok} curva(s) · ${(bytesSubidos / 1024).toFixed(1)} kB de PNG binário no bucket ${BUCKET}`)
console.log(`Liberado : ${(charsLiberados / 1024).toFixed(1)} kB de base64 fora do banco${KEEP ? ' (0 — --keep-base64)' : ''}`)
console.log(`Puladas  : ${pulou}  ·  Falhas: ${falhou}`)

const fim = await db.query(`
  SELECT count(*)::int AS linhas,
         count(storage_path)::int AS no_storage,
         count(data)::int AS ainda_base64,
         coalesce(sum(bytes),0)::bigint AS bytes_storage
    FROM exam_result_graphs`)
console.log('Estado   :', JSON.stringify(fim.rows[0]))
await db.end()
