// Offboarding de produção: remove todas as clínicas EXCETO as 3 Animais (por ID).
// DRY-RUN por padrão. Para executar de verdade: OFFBOARD_EXECUTE=1 node _prod-offboard.mjs
// Nunca imprime a connection string.
import { createRequire } from 'module'
const require = createRequire('C:/SysMax/package.json')
const dotenv = require('dotenv'); dotenv.config({ path: 'C:/SysMax/.env.local' })
const { Client } = require('pg')

const KEEP = new Set([
  '3c6d06ad-17ce-4811-a7df-6092bd3fb8c6', // Animais Clínica Veterinária
  '2b7a90c3-fb5a-40d3-bc1a-e3f78e0756f4', // Animais Diagnóstico por Imagem
  '7be4d7bb-0f70-453c-bf4f-fe37bf24a9fb', // Animais Pet
])
const EXECUTE = process.env.OFFBOARD_EXECUTE === '1'

const cs = process.env.DATABASE_URL
if (!cs) { console.error('DATABASE_URL ausente'); process.exit(1) }
const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
await client.connect()

const { rows: clinics } = await client.query('select id, name from clinics')
const keep = clinics.filter(c => KEEP.has(c.id))
const drop = clinics.filter(c => !KEEP.has(c.id))
const dropIds = drop.map(c => c.id)
console.log(`MANTER (${keep.length}):`, keep.map(c => c.name).join(' | '))
console.log(`REMOVER (${drop.length}):`, drop.map(c => c.name).join(' | '))
if (keep.length !== 3) { console.error('!! Esperava manter exatamente 3 Animais. Abortando.'); await client.end(); process.exit(2) }

const { rows: cols } = await client.query(
  `select c.table_name from information_schema.columns c
   join information_schema.tables t on t.table_name=c.table_name and t.table_schema=c.table_schema
   where c.column_name='clinic_id' and c.table_schema='public' and t.table_type='BASE TABLE'`)
const tables = cols.map(r => r.table_name).filter(t => !t.startsWith('_bkp'))
console.log('tabelas base com clinic_id:', tables.length)

// teste de capacidade (rollback)
await client.query('BEGIN')
let canBypass = false
try { await client.query('SET session_replication_role = replica'); canBypass = true } catch (e) { console.log('replica role NÃO permitido:', e.message.slice(0, 50)) }
await client.query('ROLLBACK')
console.log('bypass de FK (session_replication_role=replica):', canBypass)

const { rows: userRows } = await client.query('select id from profiles where clinic_id = ANY($1)', [dropIds])
console.log('usuários de login a remover:', userRows.length)

if (!EXECUTE) {
  console.log('\n>>> DRY-RUN — NADA foi apagado. Rode com OFFBOARD_EXECUTE=1 para executar.')
  await client.end(); process.exit(0)
}

// ===== EXECUÇÃO REAL =====
console.log('\n>>> EXECUTANDO offboarding em transação...')
await client.query('BEGIN')
try {
  if (canBypass) await client.query('SET session_replication_role = replica')
  let total = 0
  for (const t of tables) {
    const res = await client.query(`DELETE FROM "${t}" WHERE clinic_id = ANY($1)`, [dropIds])
    if (res.rowCount) { total += res.rowCount; if (res.rowCount > 50) console.log(`  ${t}: ${res.rowCount}`) }
  }
  console.log('linhas apagadas nas tabelas:', total)
  const uids = userRows.map(u => u.id)
  if (uids.length) {
    try { const u = await client.query('DELETE FROM auth.users WHERE id = ANY($1)', [uids]); console.log('auth.users apagados:', u.rowCount) }
    catch (e) { console.log('auth.users não apagados (permissão?):', e.message.slice(0, 50)) }
  }
  const cres = await client.query('DELETE FROM clinics WHERE id = ANY($1)', [dropIds])
  console.log('clínicas apagadas:', cres.rowCount)
  if (canBypass) await client.query('SET session_replication_role = default')
  await client.query('COMMIT')
  console.log('COMMIT OK')
} catch (e) {
  await client.query('ROLLBACK')
  console.error('ERRO — ROLLBACK feito, nada foi apagado:', e.message.slice(0, 120))
  await client.end(); process.exit(3)
}
const { rows: rem } = await client.query('select count(*)::int c from clinics')
const { rows: remNames } = await client.query('select name from clinics order by name')
console.log('clínicas restantes:', rem[0].c, '->', remNames.map(r => r.name).join(', '))
await client.end()
