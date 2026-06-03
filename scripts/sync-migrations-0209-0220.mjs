// Aplica + registra migrations 0209..0220 (todas idempotentes, sem duplicatas
// de número). As migrations 0217-0220 já tinham sido aplicadas via scripts
// avulsos mas NÃO foram registradas em schema_migrations — este script
// re-roda o SQL (no-op por IF NOT EXISTS) e insere o registro.
//
// O gap pré-existente (duplicatas 0115/0116/.../0179) NÃO é tocado — exige
// repair manual via supabase CLI.

import { readFileSync, readdirSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }

const TARGETS = ['0209','0210','0211','0212','0213','0214','0215','0216','0217','0218','0219','0220']

const allFiles = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql'))
const toRun = TARGETS.map(prefix => {
  const file = allFiles.find(f => f.startsWith(prefix + '_'))
  if (!file) throw new Error(`Sem arquivo para prefixo ${prefix}`)
  const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '')
  return { prefix, file, name }
})

const c = new pg.Client({ connectionString: url })
await c.connect()
c.on('notice', n => console.log('   ·', n.message))

try {
  const existing = await c.query(
    'SELECT version FROM supabase_migrations.schema_migrations WHERE version = ANY($1)',
    [TARGETS]
  )
  const alreadyRegistered = new Set(existing.rows.map(r => r.version))

  for (const { prefix, file, name } of toRun) {
    if (alreadyRegistered.has(prefix)) {
      console.log(`✓ ${prefix} ${name} — já registrada, pulando`)
      continue
    }
    const sql = readFileSync('supabase/migrations/' + file, 'utf-8')
    process.stdout.write(`→ ${prefix} ${name} ... `)
    try {
      await c.query('BEGIN')
      await c.query(sql)
      await c.query(
        'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3)',
        [prefix, name, [sql]]
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
  console.log('\nTodas as migrations 0209..0220 sincronizadas.')
} finally {
  await c.end()
}
