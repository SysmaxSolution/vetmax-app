// Compara o SCHEMA do banco de testes com o de producao e lista o que existe
// em dev e falta em prod (e o contrario). SOMENTE LEITURA nos dois.
//
// Por que: a migration 0427 estava no dev e nao em producao, e ninguem
// percebeu — a duplicidade de titulo de consulta ficou latente la. Conferir a
// deriva e mais barato que descobrir pelo defeito.
import pg from 'pg'
import { readFileSync } from 'node:fs'

const get = (e, k) => (e.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '')
const prodEnv = readFileSync('C:/SysMax/.env.local', 'utf8')
const devEnv  = readFileSync('C:/SysMax/.env.dev.local', 'utf8')

const CONSULTAS = {
  tabelas: `select table_name from information_schema.tables
             where table_schema='public' and table_type='BASE TABLE'`,
  colunas: `select table_name||'.'||column_name from information_schema.columns
             where table_schema='public'`,
  funcoes: `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public'`,
  gatilhos: `select c.relname||'.'||t.tgname from pg_trigger t
              join pg_class c on c.oid=t.tgrelid
              join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and not t.tgisinternal`,
  indices: `select indexname from pg_indexes where schemaname='public'`,
  politicas: `select tablename||'.'||policyname from pg_policies where schemaname='public'`,
}

async function ler(conn) {
  const c = new pg.Client(conn)
  await c.connect(); await c.query('BEGIN TRANSACTION READ ONLY')
  const out = {}
  for (const [k, q] of Object.entries(CONSULTAS)) {
    const { rows } = await c.query(q)
    out[k] = new Set(rows.map(r => Object.values(r)[0]))
  }
  // definicao das funcoes, para pegar corpo diferente com mesmo nome
  const { rows: fd } = await c.query(`
    select p.proname, md5(pg_get_functiondef(p.oid)) h from pg_proc p
     join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)
  out._corpoFuncao = new Map(fd.map(r => [r.proname, r.h]))
  await c.query('COMMIT'); await c.end()
  return out
}

const prod = await ler({ connectionString: get(prodEnv, 'DATABASE_URL'), ssl: { rejectUnauthorized: false } })
const dev  = await ler({ host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543,
  user: 'postgres.claqxwckiihknclhmzvf', password: get(devEnv, 'SUPABASE_DEV_DB_PASSWORD'),
  database: 'postgres', ssl: { rejectUnauthorized: false } })

let achados = 0
for (const k of Object.keys(CONSULTAS)) {
  const faltaProd = [...dev[k]].filter(x => !prod[k].has(x)).sort()
  const faltaDev  = [...prod[k]].filter(x => !dev[k].has(x)).sort()
  if (faltaProd.length) {
    achados += faltaProd.length
    console.log(`\n### ${k.toUpperCase()}: ${faltaProd.length} existe no DEV e FALTA em PROD`)
    faltaProd.slice(0, 40).forEach(x => console.log('  -', x))
    if (faltaProd.length > 40) console.log(`  ... e mais ${faltaProd.length - 40}`)
  }
  if (faltaDev.length) {
    console.log(`\n### ${k}: ${faltaDev.length} existe em PROD e falta no DEV (normalmente ok — prod e mais antiga)`)
    faltaDev.slice(0, 12).forEach(x => console.log('  -', x))
    if (faltaDev.length > 12) console.log(`  ... e mais ${faltaDev.length - 12}`)
  }
}

// funcoes com mesmo nome e CORPO diferente: o caso da 0427
const corpoDiferente = [...dev._corpoFuncao.entries()]
  .filter(([n, h]) => prod._corpoFuncao.has(n) && prod._corpoFuncao.get(n) !== h)
  .map(([n]) => n).sort()
if (corpoDiferente.length) {
  achados += corpoDiferente.length
  console.log(`\n### FUNCOES com corpo DIFERENTE entre dev e prod: ${corpoDiferente.length}`)
  corpoDiferente.forEach(n => console.log('  -', n))
}

console.log(`\ntotal de pontos de atencao: ${achados}`)
