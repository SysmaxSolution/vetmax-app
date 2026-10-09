// Aplica UMA migration em producao dentro de transacao, com conferencia
// obrigatoria antes do COMMIT. Se a conferencia falhar, reverte.
//
// Uso:
//   node scripts/aplicar-migration-prod.mjs --arquivo supabase/migrations/0427_x.sql \
//        --confere "source_module = 'consultation'" --funcao fn_sync_cashier_entry_to_financial
//   (acrescente --confirmar para gravar; sem isso e ensaio)
//
// Nunca usar SET SESSION aqui: no pooler (porta 6543) o SET persiste na
// conexao de backend e vaza para outros clientes. Escopo de transacao so.
import pg from 'pg'
import { readFileSync } from 'node:fs'

const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null }
const confirmar = process.argv.includes('--confirmar')

const arquivo = arg('arquivo')
const confere = arg('confere')     // texto que DEVE aparecer no objeto depois
const funcao  = arg('funcao')      // funcao cuja definicao sera conferida
if (!arquivo) { console.error('Falta --arquivo'); process.exit(1) }

const env = readFileSync('C:/SysMax/.env.local', 'utf8')
const get = k => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '')
const sql = readFileSync(arquivo, 'utf8')

const c = new pg.Client({ connectionString: get('DATABASE_URL'), ssl: { rejectUnauthorized: false } })
await c.connect()

try {
  await c.query('BEGIN')
  console.log('arquivo:', arquivo, '(' + sql.length + ' bytes)')

  await c.query(sql)
  console.log('executado.')

  if (confere && funcao) {
    const { rows } = await c.query(
      `select pg_get_functiondef(oid) d from pg_proc where proname = $1`, [funcao])
    if (!rows.length) throw new Error(`funcao ${funcao} nao existe depois da migration`)
    if (!rows[0].d.includes(confere))
      throw new Error(`conferencia falhou: "${confere}" nao esta na definicao de ${funcao}`)
    console.log(`conferencia OK: "${confere}" presente em ${funcao}`)
  }

  if (!confirmar) { await c.query('ROLLBACK'); console.log('\nENSAIO — nada gravado. Repita com --confirmar.') }
  else            { await c.query('COMMIT');   console.log('\nCOMMIT.') }
} catch (e) {
  await c.query('ROLLBACK')
  console.error('\nROLLBACK, nada gravado:', e.message)
  process.exitCode = 1
} finally { await c.end() }
