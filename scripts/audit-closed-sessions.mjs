/**
 * AUDITORIA (read-only): fechamentos passados afetados pelo bug do session_id.
 *
 * Antes do fix, closeCashierSession somava só lançamentos com session_id = X.
 * Vendas durante a sessão nasciam órfãs (session_id NULL) e eram ignoradas,
 * subestimando o closing_balance e inflando a "divergência" da conferência.
 *
 * Aqui recalculamos cada sessão FECHADA somando os órfãos criados dentro da
 * janela [opened_at, closed_at] da própria sessão (mesmo critério do fix) e
 * mostramos o impacto. NÃO altera nada.
 */
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  const { rows } = await c.query(`
    WITH orphan AS (
      SELECT s.id AS session_id,
             COUNT(cc.id)            AS orphan_count,
             COALESCE(SUM(cc.amount),0) AS orphan_sum
        FROM cashier_sessions s
        JOIN central_cashier cc
          ON cc.clinic_id   = s.clinic_id
         AND cc.session_id IS NULL
         AND cc.status NOT IN ('reversed','archived')
         AND cc.created_at >= s.opened_at
         AND cc.created_at <= s.closed_at
       WHERE s.status = 'closed'
       GROUP BY s.id
    )
    SELECT cl.name AS clinic,
           s.id,
           s.opened_at::date          AS dia,
           s.closing_balance::numeric AS stored_balance,
           s.counted_total::numeric   AS counted,
           s.difference::numeric      AS stored_diff,
           o.orphan_count,
           o.orphan_sum::numeric      AS orphan_sum
      FROM orphan o
      JOIN cashier_sessions s ON s.id = o.session_id
      JOIN clinics cl ON cl.id = s.clinic_id
     WHERE o.orphan_sum > 0
     ORDER BY o.orphan_sum DESC`)

  if (!rows.length) {
    console.log('✅ Nenhum fechamento passado afetado (nenhum órfão na janela de sessões fechadas).')
    process.exit(0)
  }

  console.log(`⚠️  ${rows.length} sessão(ões) fechada(s) afetada(s) pelo bug:\n`)
  const report = rows.map(r => {
    const trueBalance = Number(r.stored_balance) + Number(r.orphan_sum)
    const trueDiff = r.counted != null ? Number(r.counted) - trueBalance : null
    return {
      clinic: r.clinic,
      dia: r.dia.toISOString().slice(0, 10),
      orfaos: Number(r.orphan_count),
      valor_ignorado: Number(r.orphan_sum),
      saldo_gravado: Number(r.stored_balance),
      saldo_correto: trueBalance,
      diverg_gravada: r.stored_diff != null ? Number(r.stored_diff) : null,
      diverg_real: trueDiff != null ? Number(trueDiff.toFixed(2)) : null,
      falso_positivo: r.stored_diff != null && Math.abs(Number(r.stored_diff)) >= 0.01
                      && trueDiff != null && Math.abs(trueDiff) < 0.01,
    }
  })
  console.table(report)

  const totalIgnored = report.reduce((a, r) => a + r.valor_ignorado, 0)
  const falsePos = report.filter(r => r.falso_positivo).length
  console.log(`\nResumo: R$ ${totalIgnored.toFixed(2)} em vendas ignoradas em fechamentos passados.`)
  console.log(`${falsePos} fechamento(s) tinham divergência GRAVADA que na verdade BATERIA (falso positivo).`)
  console.log('\nNOTA: read-only. O closing_balance gravado é histórico; reprocessar exigiria decisão (não altera o caixa atual).')
} finally { await c.end() }
