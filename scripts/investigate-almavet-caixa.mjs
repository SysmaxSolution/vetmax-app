import { config } from 'node:process'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

loadEnv({ path: '.env.local' })
const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }

const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  // 1) Localizar clínica Almavet
  const { rows: clinics } = await c.query(
    `SELECT id, name FROM clinics WHERE name ILIKE '%almavet%'`
  )
  console.log('=== CLÍNICAS ALMAVET ===')
  console.table(clinics)
  if (!clinics.length) { console.log('Nenhuma clínica Almavet encontrada'); process.exit(0) }
  const clinicId = clinics[0].id

  // 2) Sessão de caixa aberta
  const { rows: sessions } = await c.query(
    `SELECT id, opened_at, closed_at, opening_balance, status
       FROM cashier_sessions
      WHERE clinic_id = $1
      ORDER BY opened_at DESC LIMIT 3`, [clinicId]
  )
  console.log('\n=== ÚLTIMAS SESSÕES ===')
  console.table(sessions)
  const openSession = sessions.find(s => s.status === 'open') ?? sessions[0]
  const sessionId = openSession?.id
  console.log('Sessão investigada:', sessionId, '| status:', openSession?.status)

  // 3) Lançamentos central_cashier dessa sessão (por session_id)
  const { rows: bySession } = await c.query(
    `SELECT status, payment_method, COUNT(*) n, SUM(amount) total
       FROM central_cashier
      WHERE clinic_id = $1 AND session_id = $2
      GROUP BY status, payment_method ORDER BY status, payment_method`,
    [clinicId, sessionId]
  )
  console.log('\n=== central_cashier POR session_id (o que o FECHAMENTO enxerga) ===')
  console.table(bySession)

  // 4) Lançamentos do dia da abertura por data (o que o RELATÓRIO enxerga)
  const openedDate = openSession.opened_at.toISOString().slice(0, 10)
  const { rows: byDate } = await c.query(
    `SELECT status, payment_method, session_id, COUNT(*) n, SUM(amount) total
       FROM central_cashier
      WHERE clinic_id = $1
        AND created_at >= $2::date
        AND created_at <  ($2::date + interval '1 day')
      GROUP BY status, payment_method, session_id
      ORDER BY status, payment_method`,
    [clinicId, openedDate]
  )
  console.log(`\n=== central_cashier POR DATA ${openedDate} (o que o RELATÓRIO enxerga) ===`)
  console.table(byDate)

  // 5) Quantos lançamentos do dia estão com session_id NULL
  const { rows: nullCheck } = await c.query(
    `SELECT (session_id IS NULL) as session_nula, COUNT(*) n, SUM(amount) total
       FROM central_cashier
      WHERE clinic_id = $1
        AND created_at >= $2::date AND created_at < ($2::date + interval '1 day')
        AND status NOT IN ('reversed','archived')
      GROUP BY (session_id IS NULL)`,
    [clinicId, openedDate]
  )
  console.log('\n=== session_id NULO vs preenchido (dia da abertura) ===')
  console.table(nullCheck)

  // 6) Saídas / sangrias da sessão
  const { rows: outflows } = await c.query(
    `SELECT category, COUNT(*) n, SUM(amount) total
       FROM cashier_outflows
      WHERE clinic_id = $1 AND session_id = $2
      GROUP BY category`,
    [clinicId, sessionId]
  )
  console.log('\n=== SAÍDAS (cashier_outflows) DA SESSÃO ===')
  console.table(outflows)

  // 7) Simulação do cálculo do fechamento (replica getSessionExpectedTotals)
  const { rows: expEntries } = await c.query(
    `SELECT payment_method, SUM(amount) total
       FROM central_cashier
      WHERE clinic_id = $1 AND session_id = $2 AND status IN ('recorded','verified')
      GROUP BY payment_method`, [clinicId, sessionId]
  )
  const { rows: expOut } = await c.query(
    `SELECT COALESCE(SUM(amount),0) total FROM cashier_outflows WHERE clinic_id=$1 AND session_id=$2`,
    [clinicId, sessionId]
  )
  const opening = Number(openSession.opening_balance)
  const cash = Number(expEntries.find(e => e.payment_method === 'cash')?.total ?? 0)
  const out = Number(expOut[0].total)
  console.log('\n=== SIMULAÇÃO DO FECHAMENTO (atual, por session_id) ===')
  console.log('opening_balance:', opening)
  console.log('entradas por método (session_id):', expEntries)
  console.log('total_outflows:', out)
  console.log('expected_cash =', opening, '+', cash, '-', out, '=', opening + cash - out)
} finally {
  await c.end()
}
