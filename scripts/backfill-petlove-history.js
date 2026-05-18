/**
 * Backfill retroativo para pets já criados via importação Petlove ANTES
 * dos fixes de log automático. Para cada pet com created_from='petlove_import':
 *   - Cria evento patient_created se ainda não existir
 *   - Cria patient_custom_prices a partir das linhas reconciliadas
 *
 * Não duplica eventos (ON CONFLICT via lookup prévio).
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
    // ─── 1. Backfill patient_created para todos os pets petlove_import ─────
    const pets = (await client.query(`
      SELECT p.id, p.clinic_id, p.name, pi.plan_type, pi.provider_id, ip.name as provider_name
      FROM patients p
      LEFT JOIN pet_insurance pi ON pi.patient_id = p.id AND pi.coverage_status='active'
      LEFT JOIN insurance_providers ip ON ip.id = pi.provider_id
      WHERE p.created_from = 'petlove_import'
    `)).rows
    console.log(`${pets.length} pets criados via petlove_import\n`)

    let createdEvents = 0
    for (const pet of pets) {
      const ex = (await client.query(
        `SELECT id FROM patient_petlove_history WHERE patient_id=$1 AND event_type='patient_created' LIMIT 1`,
        [pet.id]
      )).rows[0]
      if (ex) continue
      await client.query(`
        INSERT INTO patient_petlove_history (clinic_id, patient_id, event_type, description, metadata, created_at)
        VALUES ($1, $2, 'patient_created', $3, $4, now())
      `, [
        pet.clinic_id,
        pet.id,
        `Pet cadastrado via importação de convênio: ${pet.provider_name ?? 'Petlove'} (plano ${pet.plan_type ?? '—'})`,
        JSON.stringify({ provider_name: pet.provider_name, plan_name: pet.plan_type, backfilled: true }),
      ])
      createdEvents++
    }
    console.log(`  ✓ ${createdEvents} eventos patient_created criados\n`)

    // ─── 2. Backfill patient_custom_prices para remessas reconciliadas ─────
    const rems = (await client.query(`SELECT id, clinic_id, provider_id FROM petlove_remittances WHERE status='reconciled'`)).rows
    console.log(`${rems.length} remessas conciliadas\n`)

    let cpUpserts = 0, mappingsCreated = 0
    for (const rem of rems) {
      // Procedimentos distintos
      const procs = (await client.query(`
        SELECT DISTINCT TRIM(procedure_name_raw) as name
        FROM petlove_remittance_lines
        WHERE remittance_id=$1 AND procedure_name_raw IS NOT NULL`, [rem.id])).rows

      // Auto-create mappings
      const mapByName = new Map()
      for (const { name } of procs) {
        if (!name) continue
        const existingMap = (await client.query(
          `SELECT internal_stock_item_id FROM petlove_procedure_mappings WHERE clinic_id=$1 AND provider_id=$2 AND external_procedure_name=$3`,
          [rem.clinic_id, rem.provider_id, name]
        )).rows[0]
        if (existingMap?.internal_stock_item_id) {
          mapByName.set(name, existingMap.internal_stock_item_id)
          continue
        }
        let stockId = (await client.query(
          `SELECT id FROM stock_items WHERE clinic_id=$1 AND lower(name)=lower($2) LIMIT 1`,
          [rem.clinic_id, name]
        )).rows[0]?.id
        if (!stockId) {
          const r = await client.query(
            `INSERT INTO stock_items (clinic_id, name, category, is_service, quantity, unit, min_quantity, unit_price)
             VALUES ($1, $2, 'service', true, 0, 'un', 0, 0) RETURNING id`,
            [rem.clinic_id, name]
          )
          stockId = r.rows[0].id
        }
        await client.query(
          `INSERT INTO petlove_procedure_mappings (clinic_id, provider_id, external_procedure_name, internal_stock_item_id, is_auto_learned)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (clinic_id, provider_id, external_procedure_name)
           DO UPDATE SET internal_stock_item_id=EXCLUDED.internal_stock_item_id, updated_at=now()`,
          [rem.clinic_id, rem.provider_id, name, stockId]
        )
        mappingsCreated++
        mapByName.set(name, stockId)
      }

      // Custom prices
      const lines = (await client.query(`
        SELECT matched_patient_id, procedure_name_raw, repass_value
        FROM petlove_remittance_lines
        WHERE remittance_id=$1 AND matched_patient_id IS NOT NULL
        AND match_status IN ('matched','partial','orphan_invoice','manual_resolved')
      `, [rem.id])).rows

      for (const line of lines) {
        const stockId = mapByName.get((line.procedure_name_raw ?? '').trim())
        const price = Number(line.repass_value) || 0
        if (!stockId || price <= 0) continue
        await client.query(`
          INSERT INTO patient_custom_prices (clinic_id, patient_id, stock_item_id, custom_price, source, provider_id, last_remittance_id, observation_count)
          VALUES ($1, $2, $3, $4, 'petlove_remittance', $5, $6, 1)
          ON CONFLICT (clinic_id, patient_id, stock_item_id)
          DO UPDATE SET custom_price=EXCLUDED.custom_price, source='petlove_remittance', provider_id=EXCLUDED.provider_id,
                       last_remittance_id=EXCLUDED.last_remittance_id, last_seen_at=now(),
                       observation_count=patient_custom_prices.observation_count+1, updated_at=now()
        `, [rem.clinic_id, line.matched_patient_id, stockId, price, rem.provider_id, rem.id])
        cpUpserts++
      }
    }
    console.log(`  ✓ ${mappingsCreated} mappings novos, ${cpUpserts} custom_prices upserted\n`)

    await client.query('COMMIT')

    // Verificação final
    const final = await client.query(`
      SELECT COUNT(*)::int as total_pets,
             COUNT(DISTINCT pcp.patient_id)::int as pets_with_prices,
             COUNT(DISTINCT pph.patient_id) FILTER (WHERE pph.event_type='patient_created')::int as pets_with_log
      FROM patients p
      LEFT JOIN patient_custom_prices pcp ON pcp.patient_id=p.id
      LEFT JOIN patient_petlove_history pph ON pph.patient_id=p.id
      WHERE p.created_from='petlove_import'
    `)
    console.log('=== Verificação ===')
    console.table(final.rows)
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('❌ ROLLBACK:', e.message)
    throw e
  }

  await client.end()
})().catch(e => { console.error(e); process.exit(1) })
