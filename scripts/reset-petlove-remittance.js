/**
 * Reset cirúrgico da última remessa Petlove para re-teste.
 * - Apaga financial_entries e patient_custom_prices criados pela remessa
 * - Reverte invoice_items conciliados
 * - Reset match_status='pending' + status='imported' na remessa
 *
 * NÃO apaga pets/tutores criados pelo bulk register (eles continuam no cadastro).
 *
 * Execute: node scripts/reset-petlove-remittance.js
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim()
const m = dbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
const [, user, pw, host, port, db] = m
const client = new Client({
  user, password: decodeURIComponent(pw), host, port: +port, database: db,
  ssl: { rejectUnauthorized: false },
})

;(async () => {
  await client.connect()

  const remRow = (await client.query(`SELECT id, clinic_id, remittance_number, status FROM petlove_remittances ORDER BY imported_at DESC LIMIT 1`)).rows[0]
  if (!remRow) { console.log('Nenhuma remessa.'); return await client.end() }

  console.log(`\nResetando remessa #${remRow.remittance_number} (status atual: ${remRow.status})...`)
  const remRef = `Remessa #${remRow.remittance_number}`

  // 1. Apaga financial_entries criados pela remessa
  const fe = await client.query(
    `DELETE FROM financial_entries WHERE clinic_id=$1 AND source IN ('petlove','petlove_indicacao') AND notes ILIKE $2 RETURNING id`,
    [remRow.clinic_id, `%${remRef}%`]
  )
  console.log(`  ✓ ${fe.rowCount} financial_entries apagados`)

  // 2. Apaga patient_custom_prices vinculados
  const cp = await client.query(
    `DELETE FROM patient_custom_prices WHERE clinic_id=$1 AND last_remittance_id=$2 RETURNING id`,
    [remRow.clinic_id, remRow.id]
  )
  console.log(`  ✓ ${cp.rowCount} patient_custom_prices apagados`)

  // 3. Reverte invoice_items conciliados
  const inv = await client.query(`
    UPDATE invoice_items SET insurance_status='aguardando_repasse',
                              realized_value=NULL,
                              coparticipation_value=NULL,
                              reconciled_at=NULL,
                              reconciled_by=NULL
    WHERE id IN (
      SELECT matched_invoice_item_id
      FROM petlove_remittance_lines
      WHERE clinic_id=$1 AND remittance_id=$2 AND matched_invoice_item_id IS NOT NULL
    ) AND insurance_status='conciliado'
    RETURNING id
  `, [remRow.clinic_id, remRow.id])
  console.log(`  ✓ ${inv.rowCount} invoice_items revertidos`)

  // 4. Reset match_status em TODAS as linhas
  const lines = await client.query(`
    UPDATE petlove_remittance_lines
    SET match_status='pending', match_confidence=NULL,
        matched_invoice_item_id=NULL, matched_patient_id=NULL, matched_tutor_id=NULL,
        match_notes='[]'::jsonb,
        resolution_action=NULL, resolved_at=NULL, resolved_by=NULL
    WHERE remittance_id=$1 AND clinic_id=$2
    RETURNING id
  `, [remRow.id, remRow.clinic_id])
  console.log(`  ✓ ${lines.rowCount} linhas resetadas para pending`)

  // 5. Reset status da remessa
  await client.query(
    `UPDATE petlove_remittances SET status='imported', reconciled_at=NULL, financial_entry_id=NULL, referral_financial_entry_id=NULL WHERE id=$1`,
    [remRow.id]
  )
  console.log(`  ✓ Remessa volta para status='imported'\n`)

  // Verificação
  const check = await client.query(`SELECT match_status, COUNT(*)::int as cnt FROM petlove_remittance_lines WHERE remittance_id=$1 GROUP BY match_status`, [remRow.id])
  console.log('Estado final das linhas:')
  console.table(check.rows)

  console.log('\n✅ Pronto. Agora o usuário pode abrir a remessa e clicar "Aprovar Conciliação".')
  console.log('   O pipeline autônomo vai rodar matching → bulk register → matching → criar entries.')

  await client.end()
})().catch(e => { console.error(e); process.exit(1) })
