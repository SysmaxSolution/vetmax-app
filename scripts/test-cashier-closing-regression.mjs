/**
 * Regressão do bug "-113": uma venda em DINHEIRO compensada por uma SANGRIA
 * de igual valor não pode ser ignorada no fechamento. Antes do fix, a venda
 * nascia com session_id NULL e era ignorada → o esperado em dinheiro caía pelo
 * valor da sangria (ex.: 87 + 0 - 200 = -113). Depois do fix (trigger 0391 +
 * RPC 0392), a venda é contada e o esperado fica estável (net zero).
 *
 * Não-destrutivo: roda dentro de uma transação e faz ROLLBACK.
 * Uso: node scripts/test-cashier-closing-regression.mjs
 */
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })

function expectedCash(rows, opening, outflows) {
  const cash = rows.filter(r => r.payment_method === 'cash' && ['recorded','verified'].includes(r.status))
                   .reduce((a, r) => a + Number(r.amount), 0)
  return opening + cash - outflows
}

await c.connect()
let failed = false
try {
  // Sessão aberta qualquer (não-destrutivo: tudo em txn + rollback)
  const { rows:[s] } = await c.query(
    `SELECT id, clinic_id, opening_balance, opened_at, opened_by
       FROM cashier_sessions WHERE status='open' ORDER BY opened_at DESC LIMIT 1`)
  if (!s) { console.log('⚠️  Nenhuma sessão aberta para testar. Pulei.'); process.exit(0) }
  const opening = Number(s.opening_balance)
  const X = 137.50  // valor da venda em dinheiro = valor da sangria

  await c.query('BEGIN')

  // baseline (após linkar órfãos existentes, como faz o app)
  await c.query(`SELECT rpc_link_session_orphans($1)`, [s.id])
  const baseOut = Number((await c.query(
    `SELECT COALESCE(SUM(amount),0) t FROM cashier_outflows WHERE clinic_id=$1 AND session_id=$2`,
    [s.clinic_id, s.id])).rows[0].t)
  const baseRows = (await c.query(
    `SELECT amount, payment_method, status FROM central_cashier WHERE clinic_id=$1 AND session_id=$2`,
    [s.clinic_id, s.id])).rows
  const baseExpected = expectedCash(baseRows, opening, baseOut)

  // 1) venda em dinheiro SEM session_id (o trigger 0391 deve atribuir)
  const { rows:[sale] } = await c.query(`
    INSERT INTO central_cashier (clinic_id, source_module, amount, status, payment_method, reason)
    VALUES ($1,'manual',$2,'recorded','cash','REGRESSAO -113 (rollback)')
    RETURNING session_id`, [s.clinic_id, X])
  const triggerOk = sale.session_id === s.id

  // 2) sangria de igual valor vinculada à sessão
  await c.query(`
    INSERT INTO cashier_outflows (clinic_id, session_id, amount, category, description, created_by)
    VALUES ($1,$2,$3,'sangria','REGRESSAO -113 (rollback)',$4)`,
    [s.clinic_id, s.id, X, s.opened_by])

  // 3) recalcula como o fechamento faz (linka + soma por session_id)
  await c.query(`SELECT rpc_link_session_orphans($1)`, [s.id])
  const newOut = Number((await c.query(
    `SELECT COALESCE(SUM(amount),0) t FROM cashier_outflows WHERE clinic_id=$1 AND session_id=$2`,
    [s.clinic_id, s.id])).rows[0].t)
  const newRows = (await c.query(
    `SELECT amount, payment_method, status FROM central_cashier WHERE clinic_id=$1 AND session_id=$2`,
    [s.clinic_id, s.id])).rows
  const newExpected = expectedCash(newRows, opening, newOut)

  await c.query('ROLLBACK')

  console.log('=== Regressão -113 ===')
  console.log('Trigger atribuiu session_id à venda órfã:', triggerOk ? '✅' : '❌')
  console.log(`Esperado em dinheiro — baseline: ${baseExpected} | após venda+sangria: ${newExpected}`)
  const stable = Math.abs(newExpected - baseExpected) < 0.001
  console.log('Esperado estável (venda contada, sem queda fantasma):', stable ? '✅' : '❌')
  // Sanidade: se a venda fosse ignorada (bug), newExpected seria baseExpected - X
  console.log('Garantia anti-bug (não caiu para baseline - X):',
              Math.abs(newExpected - (baseExpected - X)) > 0.001 ? '✅' : '❌ REGREDIU')

  failed = !(triggerOk && stable)
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('ERRO no teste:', e.message); failed = true
} finally { await c.end() }
process.exit(failed ? 1 : 0)
