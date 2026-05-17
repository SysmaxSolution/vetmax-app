/**
 * Popula patient_custom_prices retroativamente para a última remessa
 * conciliada. Cria stock_items (valor 0) + mappings + custom_prices
 * para todas as linhas matched/manual_resolved/orphan_invoice que têm
 * matched_patient_id preenchido.
 *
 * Use quando o pipeline foi rodado mas custom_prices ficou vazio
 * (ex: scripts antigos sem upsert ou pipeline antigo sem auto-create
 * de mapping).
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
  await client.query('BEGIN')

  try {
    const rem = (await client.query(
      `SELECT id, clinic_id, provider_id, remittance_number FROM petlove_remittances ORDER BY imported_at DESC LIMIT 1`
    )).rows[0]
    if (!rem) throw new Error('Nenhuma remessa.')
    console.log(`Remessa #${rem.remittance_number} (${rem.id})\n`)

    // 1. Procedimentos distintos na remessa
    const procs = (await client.query(
      `SELECT DISTINCT TRIM(procedure_name_raw) as name FROM petlove_remittance_lines WHERE remittance_id=$1 AND clinic_id=$2 AND procedure_name_raw IS NOT NULL`,
      [rem.id, rem.clinic_id]
    )).rows.map(r => r.name).filter(Boolean)
    console.log(`${procs.length} procedimentos distintos\n`)

    // 2. Para cada, garante stock_item + mapping
    const mappingByName = new Map()
    let createdStock = 0, createdMappings = 0
    for (const name of procs) {
      // a) mapping existente?
      const existingMap = (await client.query(
        `SELECT internal_stock_item_id FROM petlove_procedure_mappings WHERE clinic_id=$1 AND provider_id=$2 AND external_procedure_name=$3`,
        [rem.clinic_id, rem.provider_id, name]
      )).rows[0]
      if (existingMap?.internal_stock_item_id) {
        mappingByName.set(name, existingMap.internal_stock_item_id)
        continue
      }

      // b) stock_item existente com mesmo nome?
      let stockId = (await client.query(
        `SELECT id FROM stock_items WHERE clinic_id=$1 AND lower(name)=lower($2) LIMIT 1`,
        [rem.clinic_id, name]
      )).rows[0]?.id

      // c) cria stock_item zerado
      if (!stockId) {
        const r = await client.query(
          `INSERT INTO stock_items (clinic_id, name, category, is_service, quantity, unit, min_quantity, unit_price)
           VALUES ($1, $2, 'service', true, 0, 'un', 0, 0) RETURNING id`,
          [rem.clinic_id, name]
        )
        stockId = r.rows[0].id
        createdStock++
      }

      // d) cria mapping
      await client.query(
        `INSERT INTO petlove_procedure_mappings (clinic_id, provider_id, external_procedure_name, internal_stock_item_id, is_auto_learned)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (clinic_id, provider_id, external_procedure_name)
         DO UPDATE SET internal_stock_item_id=EXCLUDED.internal_stock_item_id, updated_at=now()`,
        [rem.clinic_id, rem.provider_id, name, stockId]
      )
      createdMappings++
      mappingByName.set(name, stockId)
    }
    console.log(`  ${createdStock} stock_items criados, ${createdMappings} mappings criados\n`)

    // 3. Para cada linha com matched_patient_id, upsert patient_custom_prices
    const lines = (await client.query(
      `SELECT id, matched_patient_id, procedure_name_raw, repass_value
       FROM petlove_remittance_lines
       WHERE remittance_id=$1 AND clinic_id=$2 AND matched_patient_id IS NOT NULL
       AND match_status IN ('matched','partial','orphan_invoice','manual_resolved')`,
      [rem.id, rem.clinic_id]
    )).rows
    console.log(`${lines.length} linhas com patient identificado\n`)

    let upserts = 0
    for (const line of lines) {
      const stockId = mappingByName.get((line.procedure_name_raw ?? '').trim())
      const repass = Number(line.repass_value) || 0
      if (!stockId || repass <= 0) continue

      await client.query(
        `INSERT INTO patient_custom_prices (clinic_id, patient_id, stock_item_id, custom_price, source, provider_id, last_remittance_id, observation_count)
         VALUES ($1, $2, $3, $4, 'petlove_remittance', $5, $6, 1)
         ON CONFLICT (clinic_id, patient_id, stock_item_id)
         DO UPDATE SET
           custom_price       = EXCLUDED.custom_price,
           source             = 'petlove_remittance',
           provider_id        = EXCLUDED.provider_id,
           last_remittance_id = EXCLUDED.last_remittance_id,
           last_seen_at       = now(),
           observation_count  = patient_custom_prices.observation_count + 1,
           updated_at         = now()`,
        [rem.clinic_id, line.matched_patient_id, stockId, repass, rem.provider_id, rem.id]
      )
      upserts++
    }
    console.log(`  ${upserts} patient_custom_prices upserted\n`)

    await client.query('COMMIT')

    const finalCount = (await client.query(`SELECT COUNT(*)::int as cnt FROM patient_custom_prices WHERE clinic_id=$1`, [rem.clinic_id])).rows[0].cnt
    console.log(`✅ Total patient_custom_prices na clínica: ${finalCount}`)
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('❌ ROLLBACK:', e.message)
    throw e
  }

  await client.end()
})().catch(e => { console.error(e); process.exit(1) })
