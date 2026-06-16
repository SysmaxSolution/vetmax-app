/**
 * Backfill: vincula lançamentos órfãos de central_cashier (session_id NULL)
 * à sessão de caixa ABERTA da clínica, quando criados após a abertura.
 *
 * Causa: vendas inseridas durante a sessão nasciam sem session_id, e o
 * fechamento (que filtra por session_id) ignorava todas elas.
 *
 * Seguro: 1 sessão aberta por clínica (índice único parcial) → vínculo
 * inequívoco. Só toca linhas NULL com created_at >= opened_at.
 *
 * Uso:  node scripts/backfill-orphan-session-entries.mjs          (dry-run)
 *       node scripts/backfill-orphan-session-entries.mjs --apply  (aplica)
 */
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

loadEnv({ path: '.env.local' })
const url = process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1) }
const APPLY = process.argv.includes('--apply')

const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  // Prévia: o que será vinculado, por clínica/sessão
  const { rows: preview } = await c.query(`
    SELECT s.clinic_id, cl.name AS clinic, s.id AS session_id, s.opened_at,
           COUNT(cc.id) AS orphans, COALESCE(SUM(cc.amount),0) AS total
      FROM cashier_sessions s
      JOIN clinics cl ON cl.id = s.clinic_id
      JOIN central_cashier cc
        ON cc.clinic_id = s.clinic_id
       AND cc.session_id IS NULL
       AND cc.created_at >= s.opened_at
     WHERE s.status = 'open'
     GROUP BY s.clinic_id, cl.name, s.id, s.opened_at
     ORDER BY total DESC`)
  console.log('=== PRÉVIA — órfãos a vincular (sessões abertas) ===')
  console.table(preview)

  if (!APPLY) { console.log('\nDry-run. Rode com --apply para efetivar.'); process.exit(0) }

  const { rowCount } = await c.query(`
    UPDATE central_cashier cc
       SET session_id = s.id
      FROM cashier_sessions s
     WHERE s.status = 'open'
       AND cc.clinic_id = s.clinic_id
       AND cc.session_id IS NULL
       AND cc.created_at >= s.opened_at`)
  console.log(`\n✅ Vinculados ${rowCount} lançamentos órfãos.`)
} finally {
  await c.end()
}
