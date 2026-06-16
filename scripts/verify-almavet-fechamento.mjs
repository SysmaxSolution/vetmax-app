import { config as loadEnv } from 'dotenv'
import pg from 'pg'

loadEnv({ path: '.env.local' })
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  const clinicId = '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae'
  const { rows: [s] } = await c.query(
    `SELECT id, opening_balance, opened_at FROM cashier_sessions
      WHERE clinic_id=$1 AND status='open' LIMIT 1`, [clinicId])

  // Replica a query NOVA do fechamento: sessão OU órfão na janela
  const { rows: byMethod } = await c.query(`
    SELECT payment_method, SUM(amount) total
      FROM central_cashier
     WHERE clinic_id=$1
       AND (session_id=$2 OR (session_id IS NULL AND created_at >= $3))
       AND status IN ('recorded','verified')
     GROUP BY payment_method ORDER BY payment_method`,
    [clinicId, s.id, s.opened_at])

  const { rows: [out] } = await c.query(
    `SELECT COALESCE(SUM(amount),0) total FROM cashier_outflows
      WHERE clinic_id=$1 AND session_id=$2`, [clinicId, s.id])

  const opening = Number(s.opening_balance)
  const m = Object.fromEntries(byMethod.map(r => [r.payment_method, Number(r.total)]))
  const totalInflows = byMethod.reduce((a, r) => a + Number(r.total), 0)
  const totalOut = Number(out.total)
  const cash = m['cash'] ?? 0

  console.log('=== FECHAMENTO RECALCULADO (lógica nova) — Almavet ===')
  console.log('Fundo de troco (abertura):', opening)
  console.log('Entradas por forma:', m)
  console.log('Total de entradas:', totalInflows)
  console.log('Saídas/sangrias:', totalOut)
  console.log('---')
  console.log('Dinheiro esperado na gaveta =', `${opening} + ${cash} - ${totalOut} =`, opening + cash - totalOut)
  console.log('PIX esperado     =', m['pix'] ?? 0)
  console.log('Crédito esperado =', m['credit'] ?? 0)
  console.log('Débito esperado  =', m['debit'] ?? 0)
  console.log('Saldo final do caixa =', opening + totalInflows - totalOut)
  console.log('---')
  const ok = (opening + cash - totalOut) === 87 && (m['pix'] ?? 0) === 393 && (m['credit'] ?? 0) === 27.5
  console.log(ok ? '✅ BATE com a contagem do operador (87 dinheiro / 393 PIX / 27,50 crédito)'
                 : '❌ Ainda divergente')
} finally { await c.end() }
