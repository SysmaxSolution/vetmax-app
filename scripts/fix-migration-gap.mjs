/**
 * Resolve o gap pré-existente de prefixos duplicados em supabase/migrations.
 * Regra:
 *   - Se algum arquivo do prefixo já está em schema_migrations.version → mantém esse número.
 *   - Os demais arquivos do mesmo prefixo viram números novos, sequenciais a partir do
 *     próximo livre (0221+), em ordem (prefixo original asc, nome asc).
 *
 * Após decidir o plano:
 *   1. `git mv` cada arquivo renumerado (preserva histórico).
 *   2. Aplica o SQL em transação (todas são idempotentes via IF NOT EXISTS).
 *   3. Insere em schema_migrations.
 *
 * Modo de operação: passe `--apply` para executar; sem flag, só imprime o plano.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')
const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }

const MIG_DIR = 'supabase/migrations'

// ─── 1. Coleta estado ───────────────────────────────────────────────────────
const files = readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort()
const groups = new Map()
for (const f of files) {
  const m = f.match(/^(\d+)_(.+)\.sql$/)
  if (!m) continue
  const [, prefix, name] = m
  if (!groups.has(prefix)) groups.set(prefix, [])
  groups.get(prefix).push({ file: f, name })
}

const c = new pg.Client({ connectionString: url })
await c.connect()

// ─── Pré-passo: corrige prefixos 5-dígitos (00321, 00331) ───────────────────
// Esses arquivos têm os mesmos números intencionalmente (0321, 0331), só foram
// gravados com zero a mais. Normaliza arquivo + registro do banco.
const fiveDig = files.filter(f => /^\d{5,}_/.test(f))
const fivePlan = fiveDig.map(f => {
  const m = f.match(/^0*(\d{4})_(.+)\.sql$/)
  if (!m) return null
  const [, prefix4, name] = m
  return { oldFile: f, newFile: `${prefix4}_${name}.sql`, oldVersion: f.split('_')[0], newVersion: prefix4, name }
}).filter(Boolean)

if (fivePlan.length > 0) {
  console.log('═══ Pré-passo: corrige prefixos 5-dígitos ═══\n')
  for (const p of fivePlan) console.log(`  ${p.oldFile}  →  ${p.newFile}  (DB: ${p.oldVersion} → ${p.newVersion})`)
  if (APPLY) {
    for (const p of fivePlan) {
      execSync(`git mv "${MIG_DIR}/${p.oldFile}" "${MIG_DIR}/${p.newFile}"`, { stdio: 'pipe' })
      await c.query('UPDATE supabase_migrations.schema_migrations SET version=$1 WHERE version=$2', [p.newVersion, p.oldVersion])
      console.log(`  ✓ ${p.newVersion}`)
    }
    // Re-popula files após renomeação
    const updated = readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort()
    files.length = 0
    files.push(...updated)
    groups.clear()
    for (const f of files) {
      const m = f.match(/^(\d+)_(.+)\.sql$/)
      if (!m) continue
      const [, prefix, name] = m
      if (!groups.has(prefix)) groups.set(prefix, [])
      groups.get(prefix).push({ file: f, name })
    }
  } else {
    console.log('  (dry-run)\n')
  }
}

const reg = await c.query('SELECT version, name FROM supabase_migrations.schema_migrations')
const regByVersion = new Map(reg.rows.map(r => [r.version, r.name]))

// ─── 2. Próximo número livre ────────────────────────────────────────────────
// Ignora prefixos 5-dígitos do cálculo: eles serão normalizados para 4-dig
// no pré-passo (mesmo número, sem zero extra).
const prefixesFromFiles = [...groups.keys()].filter(p => p.length === 4).map(p => parseInt(p, 10))
const prefixesFromReg   = [...regByVersion.keys()].filter(p => p.length === 4).map(p => parseInt(p, 10))
const fiveDigNormalized = fivePlan.map(p => parseInt(p.newVersion, 10))
const usedPrefixes = new Set([...prefixesFromFiles, ...prefixesFromReg, ...fiveDigNormalized])
let nextFree = Math.max(...usedPrefixes) + 1

// ─── 3. Decide plano ────────────────────────────────────────────────────────
const dupPrefixes = [...groups.entries()].filter(([, arr]) => arr.length > 1).map(([p]) => p).sort()

const plan = []   // [{ oldFile, newFile, prefix: novo, name }]
const keepRegister = []  // { prefix, name, file } — manteve prefixo, precisa registrar no DB

for (const prefix of dupPrefixes) {
  const arr = [...groups.get(prefix)].sort((a, b) => a.name.localeCompare(b.name))
  const registered = regByVersion.get(prefix)
  let keeper
  if (registered) {
    keeper = arr.find(x => x.name === registered)
  }
  if (!keeper) keeper = arr[0]   // sem registro → alfabético primeiro fica
  for (const f of arr) {
    if (f === keeper) {
      if (!registered) keepRegister.push({ prefix, name: f.name, file: f.file })
      continue
    }
    const newPrefix = String(nextFree).padStart(4, '0')
    nextFree++
    plan.push({
      oldFile: f.file,
      newFile: `${newPrefix}_${f.name}.sql`,
      prefix:  newPrefix,
      name:    f.name,
    })
  }
}

// ─── 4. Imprime plano ───────────────────────────────────────────────────────
console.log('═══ Plano de renumeração ═══\n')
console.log(`Próximo número livre: ${String(nextFree).padStart(4, '0')}  (sequencial após maior atual)\n`)
console.log('Arquivos a renumerar (preserva histórico via git mv):')
for (const p of plan) console.log(`  ${p.oldFile.padEnd(60)} →  ${p.newFile}`)
console.log(`\nTotal: ${plan.length} renumerações`)

if (keepRegister.length > 0) {
  console.log('\nArquivos que MANTÉM o número original mas faltam registrar no banco:')
  for (const k of keepRegister) console.log(`  ${k.prefix} - ${k.name}`)
}

if (!APPLY) {
  console.log('\n(modo dry-run — passe --apply para executar)')
  await c.end()
  process.exit(0)
}

// ─── 5. Executa renomeações via git mv ──────────────────────────────────────
console.log('\n═══ Aplicando renomeações ═══\n')
for (const p of plan) {
  try {
    execSync(`git mv "${MIG_DIR}/${p.oldFile}" "${MIG_DIR}/${p.newFile}"`, { stdio: 'pipe' })
    console.log(`  mv  ${p.oldFile}  →  ${p.newFile}`)
  } catch (e) {
    console.error(`  FALHA: ${p.oldFile}`, e.message)
    process.exit(1)
  }
}

// ─── 6. Aplica SQL + registra ───────────────────────────────────────────────
console.log('\n═══ Aplicando + registrando no schema_migrations ═══\n')

// Registra primeiro os "keepers" sem registro (mantêm prefixo original)
for (const k of keepRegister) {
  const sql = readFileSync(`${MIG_DIR}/${k.file}`, 'utf-8')
  process.stdout.write(`  ${k.prefix} ${k.name} (keeper) ... `)
  try {
    await c.query('BEGIN')
    await c.query(sql)
    await c.query(
      'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3)',
      [k.prefix, k.name, [sql]]
    )
    await c.query('COMMIT')
    console.log('OK')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    console.log('FALHA')
    console.error('   ERRO:', e.message)
    process.exit(1)
  }
}

// Aplica + registra os renumerados (já com newFile no FS)
for (const p of plan) {
  const sql = readFileSync(`${MIG_DIR}/${p.newFile}`, 'utf-8')
  process.stdout.write(`  ${p.prefix} ${p.name} (renumerado) ... `)
  try {
    await c.query('BEGIN')
    await c.query(sql)
    await c.query(
      'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3)',
      [p.prefix, p.name, [sql]]
    )
    await c.query('COMMIT')
    console.log('OK')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    console.log('FALHA')
    console.error('   ERRO:', e.message)
    process.exit(1)
  }
}

await c.end()
console.log('\n═══ Concluído ═══')
