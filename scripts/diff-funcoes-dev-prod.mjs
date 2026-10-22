// Mostra a diferença, linha a linha, do corpo das funções que divergem entre o
// banco de testes e o de produção. SOMENTE LEITURA nos dois.
//
// Uso: node scripts/diff-funcoes-dev-prod.mjs [nome1 nome2 ...]
//      sem argumentos, descobre sozinho quais divergem.
import pg from 'pg'
import { readFileSync } from 'node:fs'

const get = (e, k) => (e.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '')
const prodEnv = readFileSync('C:/SysMax/.env.local', 'utf8')
const devEnv  = readFileSync('C:/SysMax/.env.dev.local', 'utf8')

async function corpos(conn) {
  const c = new pg.Client(conn)
  await c.connect(); await c.query('BEGIN TRANSACTION READ ONLY')
  const { rows } = await c.query(`
    select p.proname, pg_get_functiondef(p.oid) def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'`)
  await c.query('COMMIT'); await c.end()
  return new Map(rows.map(r => [r.proname, r.def]))
}

const prod = await corpos({ connectionString: get(prodEnv, 'DATABASE_URL'), ssl: { rejectUnauthorized: false } })
const dev  = await corpos({ host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543,
  user: 'postgres.claqxwckiihknclhmzvf', password: get(devEnv, 'SUPABASE_DEV_DB_PASSWORD'),
  database: 'postgres', ssl: { rejectUnauthorized: false } })

const pedidos = process.argv.slice(2)
const alvos = pedidos.length ? pedidos
  : [...dev.keys()].filter(n => prod.has(n) && prod.get(n) !== dev.get(n)).sort()

console.log('funcoes divergentes:', alvos.length, '\n')

// diff simples por linha, suficiente para ler uma definicao de funcao
function diff(a, b) {
  const A = a.split('\n'), B = b.split('\n')
  const soA = A.filter(l => !B.includes(l))
  const soB = B.filter(l => !A.includes(l))
  return { soA, soB }
}

for (const nome of alvos) {
  const dp = prod.get(nome), dd = dev.get(nome)
  console.log('='.repeat(72))
  console.log('FUNCAO: ' + nome)
  if (!dp) { console.log('  nao existe em PRODUCAO'); continue }
  if (!dd) { console.log('  nao existe em TESTES'); continue }
  console.log(`  tamanho prod=${dp.length}  dev=${dd.length}`)
  const { soA, soB } = diff(dp, dd)
  if (!soA.length && !soB.length) { console.log('  so difere em espaco/ordem'); continue }
  console.log('  --- so em PRODUCAO (' + soA.length + ' linhas) ---')
  soA.slice(0, 18).forEach(l => console.log('  - ' + l.trim().slice(0, 110)))
  if (soA.length > 18) console.log(`  ... +${soA.length - 18}`)
  console.log('  +++ so em TESTES (' + soB.length + ' linhas) +++')
  soB.slice(0, 18).forEach(l => console.log('  + ' + l.trim().slice(0, 110)))
  if (soB.length > 18) console.log(`  ... +${soB.length - 18}`)
}
