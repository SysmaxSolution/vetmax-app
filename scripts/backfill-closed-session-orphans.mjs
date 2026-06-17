/**
 * Remediação Opção B (council): vincula órfãos (session_id NULL) de sessões
 * FECHADAS à sua sessão, SEM tocar em closing_balance/difference (fato
 * atestado na conferência cega). Idempotente, auditado, reversível por batch.
 *
 * Guardas (council):
 *  - só vincula quando EXATAMENTE UMA sessão fechada cobre o lançamento
 *    (janela [opened_at, closed_at]); ambíguos (overlap) são PULADOS, nunca
 *    chutados.
 *  - WHERE session_id IS NULL → rerun é no-op.
 *  - registra cada vínculo em cashier_orphan_backfill_log (batch_id p/ rollback).
 *  - critério de aceite: ao final, zero órfãos não-ambíguos de sessão fechada.
 *
 * Uso:  node scripts/backfill-closed-session-orphans.mjs           (dry-run)
 *       node scripts/backfill-closed-session-orphans.mjs --apply   (aplica)
 *
 * Rollback de um batch:
 *   UPDATE central_cashier cc SET session_id = NULL
 *     FROM cashier_orphan_backfill_log l
 *    WHERE l.batch_id = '<BATCH>' AND cc.id = l.entry_id;
 */
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })
const APPLY = process.argv.includes('--apply')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })

const CAND_CTE = `
  WITH cand AS (
    SELECT cc.id AS entry_id, cc.clinic_id, cc.amount, cc.status,
           array_agg(s.id) AS sessions,
           (array_agg(s.id))[1] AS session_id,
           (array_agg(s.opened_at))[1] AS opened_at,
           (array_agg(s.closed_at))[1] AS closed_at
      FROM central_cashier cc
      JOIN cashier_sessions s
        ON s.clinic_id = cc.clinic_id
       AND s.status = 'closed'
       AND cc.created_at >= s.opened_at
       AND cc.created_at <= s.closed_at
     WHERE cc.session_id IS NULL
       AND cc.status NOT IN ('reversed','archived')
     GROUP BY cc.id, cc.clinic_id, cc.amount, cc.status
  )`

await c.connect()
try {
  const { rows: summary } = await c.query(`${CAND_CTE}
    SELECT CASE WHEN array_length(sessions,1)=1 THEN 'unico' ELSE 'ambiguo' END AS tipo,
           COUNT(*) n, SUM(amount)::numeric total
      FROM cand GROUP BY 1`)
  console.log('=== Candidatos (órfãos de sessões fechadas) ===')
  console.table(summary)

  if (!APPLY) { console.log('\nDry-run. Rode com --apply para efetivar (não altera closing_balance).'); process.exit(0) }

  const batch = (await c.query('SELECT gen_random_uuid() AS id')).rows[0].id
  await c.query('BEGIN')

  const ins = await c.query(`${CAND_CTE}
    INSERT INTO cashier_orphan_backfill_log
      (batch_id, entry_id, clinic_id, old_session_id, new_session_id, amount, entry_status, session_opened_at, session_closed_at)
    SELECT $1, entry_id, clinic_id, NULL, session_id, amount, status, opened_at, closed_at
      FROM cand WHERE array_length(sessions,1)=1`, [batch])

  const upd = await c.query(`
    UPDATE central_cashier cc
       SET session_id = l.new_session_id
      FROM cashier_orphan_backfill_log l
     WHERE l.batch_id = $1 AND cc.id = l.entry_id AND cc.session_id IS NULL`, [batch])

  // Critério de aceite: log == update, e nenhum órfão único remanescente.
  const { rows: remain } = await c.query(`${CAND_CTE}
    SELECT COUNT(*) n FROM cand WHERE array_length(sessions,1)=1`)
  const remainN = Number(remain[0].n)

  if (ins.rowCount !== upd.rowCount || remainN !== 0) {
    await c.query('ROLLBACK')
    console.error(`❌ Aceite falhou (log=${ins.rowCount}, update=${upd.rowCount}, restantes=${remainN}). Rollback.`)
    process.exit(1)
  }

  await c.query('COMMIT')
  console.log(`✅ Batch ${batch}: ${upd.rowCount} órfãos vinculados. closing_balance intacto.`)
  console.log(`   Ambíguos pulados (overlap) permanecem órfãos — ver dry-run.`)
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('ERRO:', e.message); process.exit(1)
} finally { await c.end() }
