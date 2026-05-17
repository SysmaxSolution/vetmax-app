/**
 * Executa o pipeline COMPLETO de applyReconciliation diretamente no banco
 * (sem passar pelo Next.js). Confirma se o problema é deployment ou bug.
 *
 * 1. runMatchEngine sobre todas as linhas
 * 2. bulkCreate para missing_patient_profile
 * 3. re-runMatchEngine
 * 4. Cria financial_entries individuais para cada linha matched/orphan/manual_resolved
 *
 * Execute: node scripts/force-apply-petlove.js
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

function normalizeChip(s) {
  return (s ?? '').replace(/^#/, '').replace(/\D/g, '').trim()
}
function normalizeName(s) {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}
function mapSpecies(raw) {
  const s = normalizeName(raw)
  if (/cachorro|cao|canino/.test(s)) return 'dog'
  if (/gato|felino/.test(s))         return 'cat'
  if (/passaro|ave/.test(s))         return 'bird'
  if (/coelho/.test(s))              return 'rabbit'
  return 'exotic'
}
function fmtDateBR(iso) {
  if (!iso) return ''
  if (iso instanceof Date) {
    const dd = String(iso.getUTCDate()).padStart(2, '0')
    const mm = String(iso.getUTCMonth() + 1).padStart(2, '0')
    const yyyy = iso.getUTCFullYear()
    return `${dd}/${mm}/${yyyy}`
  }
  const [y, m, d] = String(iso).split('-')
  return `${d}/${m}/${y}`
}

;(async () => {
  await client.connect()
  await client.query('BEGIN')

  try {
    // Pega remessa mais recente
    const remRow = (await client.query(`SELECT id, clinic_id, status, remittance_number, period_end, provider_id FROM petlove_remittances ORDER BY imported_at DESC LIMIT 1`)).rows[0]
    if (!remRow) throw new Error('Nenhuma remessa.')
    console.log(`\n=== Processando remessa #${remRow.remittance_number} (${remRow.id})`)
    console.log(`    clinic_id: ${remRow.clinic_id}`)
    console.log(`    status atual: ${remRow.status}\n`)

    // ─── STEP 1: runMatchEngine ─────────────────────────────────────────────
    console.log('STEP 1: Matching (sem fallback de invoice — pet → missing_patient_profile)')

    const allLines = (await client.query(
      `SELECT id, microchip_raw, pet_name_raw, tutor_name_raw FROM petlove_remittance_lines WHERE remittance_id=$1 AND clinic_id=$2`,
      [remRow.id, remRow.clinic_id]
    )).rows

    const chips = [...new Set(allLines.map(l => normalizeChip(l.microchip_raw)).filter(Boolean))]
    const names = [...new Set(allLines.map(l => normalizeName(l.pet_name_raw)).filter(Boolean))]
    console.log(`  ${allLines.length} linhas | ${chips.length} chips | ${names.length} nomes`)

    // Lookup pets por chip
    const petsByChip = new Map()
    if (chips.length > 0) {
      const chipFilter = chips.flatMap(c => [c, `#${c}`])
      const r = await client.query(
        `SELECT id, name, tutor_id, microchip_id, microchip FROM patients WHERE clinic_id=$1 AND (microchip_id = ANY($2) OR microchip = ANY($2))`,
        [remRow.clinic_id, chipFilter]
      )
      for (const p of r.rows) {
        const c = normalizeChip(p.microchip_id ?? p.microchip)
        if (c) petsByChip.set(c, { id: p.id, tutor_id: p.tutor_id })
      }
    }

    // Lookup pets por nome
    const petsByName = new Map()
    const r2 = await client.query(`SELECT id, name, tutor_id FROM patients WHERE clinic_id=$1`, [remRow.clinic_id])
    for (const p of r2.rows) {
      const k = normalizeName(p.name)
      const list = petsByName.get(k) ?? []
      list.push({ id: p.id, tutor_id: p.tutor_id })
      petsByName.set(k, list)
    }

    let updatesMatched = 0, updatesMissing = 0
    for (const line of allLines) {
      const chip = normalizeChip(line.microchip_raw)
      const nameKey = normalizeName(line.pet_name_raw)
      let patient = chip ? petsByChip.get(chip) : null
      if (!patient && nameKey) {
        const cands = petsByName.get(nameKey) ?? []
        if (cands.length === 1) patient = cands[0]
      }

      if (patient) {
        // orphan_invoice (não há invoice_item pré-existente — pular busca)
        await client.query(
          `UPDATE petlove_remittance_lines SET match_status='orphan_invoice', match_confidence=90, matched_patient_id=$1, matched_tutor_id=$2 WHERE id=$3`,
          [patient.id, patient.tutor_id, line.id]
        )
        updatesMatched++
      } else {
        await client.query(
          `UPDATE petlove_remittance_lines SET match_status='missing_patient_profile', match_confidence=0 WHERE id=$1`,
          [line.id]
        )
        updatesMissing++
      }
    }
    console.log(`  → ${updatesMatched} pets encontrados, ${updatesMissing} missing\n`)

    // ─── STEP 2: bulk register dos missing ──────────────────────────────────
    console.log('STEP 2: Bulk register dos missing_patient_profile')

    // Provider Petlove
    const provRow = (await client.query(
      `SELECT id FROM insurance_providers WHERE clinic_id=$1 AND name ILIKE 'petlove' LIMIT 1`,
      [remRow.clinic_id]
    )).rows[0]
    if (!provRow) throw new Error('Petlove provider não cadastrado')

    const missingLines = (await client.query(
      `SELECT id, remittance_id, tutor_name_raw, pet_name_raw, species_raw, breed_raw, microchip_raw, plan_name_raw, membership_id_raw FROM petlove_remittance_lines WHERE remittance_id=$1 AND clinic_id=$2 AND match_status='missing_patient_profile'`,
      [remRow.id, remRow.clinic_id]
    )).rows

    const seenKeys = new Set()
    const tutorCache = new Map()
    let createdTutors = 0, createdPets = 0, createdInsurance = 0, reusedTutors = 0

    for (const line of missingLines) {
      const chip = normalizeChip(line.microchip_raw)
      const petName = (line.pet_name_raw ?? '').trim()
      const tutorName = (line.tutor_name_raw ?? '').trim()
      const key = chip || `${normalizeName(petName)}|${normalizeName(tutorName)}`
      if (seenKeys.has(key)) continue
      seenKeys.add(key)

      // Tutor find-or-create
      const tutorKey = normalizeName(tutorName || `petlove-${chip || line.id}`)
      let tutorId = tutorCache.get(tutorKey)
      if (!tutorId && tutorName) {
        const ex = (await client.query(`SELECT id FROM tutors WHERE clinic_id=$1 AND name ILIKE $2 LIMIT 1`, [remRow.clinic_id, tutorName])).rows[0]
        if (ex) { tutorId = ex.id; tutorCache.set(tutorKey, tutorId); reusedTutors++ }
      }
      if (!tutorId) {
        const cpf = `PL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase()
        const nt = await client.query(
          `INSERT INTO tutors (clinic_id, name, cpf, phone, email, created_from) VALUES ($1,$2,$3,$4,NULL,'petlove_import') RETURNING id`,
          [remRow.clinic_id, tutorName || `Tutor Petlove (chip ${chip || 's/n'})`, cpf, '(não informado)']
        )
        tutorId = nt.rows[0].id
        tutorCache.set(tutorKey, tutorId)
        createdTutors++
      }

      // Patient create
      const species = mapSpecies(line.species_raw)
      const finalName = petName || `Pet Petlove (chip ${chip || 's/n'})`
      const np = await client.query(
        `INSERT INTO patients (clinic_id, tutor_id, name, species, breed, microchip_id, microchip, notes, created_from)
         VALUES ($1,$2,$3,$4,$5,$6::varchar,$7::text,$8,'petlove_import') RETURNING id`,
        [remRow.clinic_id, tutorId, finalName, species, line.breed_raw, chip || null, chip || null,
         '⚠ Cadastro rápido via importação Petlove. Complete os dados na próxima visita.']
      )
      const patientId = np.rows[0].id
      createdPets++

      // Pet insurance
      await client.query(
        `INSERT INTO pet_insurance (clinic_id, patient_id, tutor_id, provider_id, plan_type, member_id, coverage_status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,'active',$7)`,
        [remRow.clinic_id, patientId, tutorId, provRow.id,
         line.plan_name_raw || 'Petlove',
         line.membership_id_raw || chip || patientId,
         `Cadastrado em massa via remessa ${remRow.id}`]
      )
      createdInsurance++

      // Atualiza TODAS as linhas desta remessa do mesmo pet
      if (chip) {
        await client.query(
          `UPDATE petlove_remittance_lines SET match_status='manual_resolved', matched_patient_id=$1, matched_tutor_id=$2, resolution_action='patient_created_bulk' WHERE remittance_id=$3 AND clinic_id=$4 AND (microchip_raw=$5 OR microchip_raw=$6)`,
          [patientId, tutorId, remRow.id, remRow.clinic_id, chip, `#${chip}`]
        )
      } else {
        await client.query(
          `UPDATE petlove_remittance_lines SET match_status='manual_resolved', matched_patient_id=$1, matched_tutor_id=$2, resolution_action='patient_created_bulk' WHERE remittance_id=$3 AND clinic_id=$4 AND pet_name_raw ILIKE $5`,
          [patientId, tutorId, remRow.id, remRow.clinic_id, petName]
        )
      }
    }
    console.log(`  → ${createdPets} pets criados, ${createdTutors} tutores criados (${reusedTutors} reaproveitados), ${createdInsurance} pet_insurance criados\n`)

    // ─── STEP 3: Criar financial_entries individuais ─────────────────────────
    console.log('STEP 3: Criar financial_entries individuais por linha')
    const linesFinal = (await client.query(
      `SELECT id, match_status, matched_patient_id, matched_tutor_id, repass_value, procedure_name_raw, service_date FROM petlove_remittance_lines WHERE remittance_id=$1 AND clinic_id=$2 AND match_status IN ('matched','partial','orphan_invoice','manual_resolved') AND matched_patient_id IS NOT NULL AND matched_tutor_id IS NOT NULL`,
      [remRow.id, remRow.clinic_id]
    )).rows

    let entriesCreated = 0, totalAmount = 0
    for (const line of linesFinal) {
      const repass = Number(line.repass_value) || 0
      const description = `Petlove · ${(line.procedure_name_raw || 'Procedimento').trim()} · ${fmtDateBR(line.service_date)}`
      const notes = `Remessa #${remRow.remittance_number} · linha ${line.id} · pet criado via bulk register`

      // Idempotente: skip se já existe entry com este notes
      const ex = (await client.query(
        `SELECT id FROM financial_entries WHERE clinic_id=$1 AND source='petlove' AND notes ILIKE $2 LIMIT 1`,
        [remRow.clinic_id, `%linha ${line.id}%`]
      )).rows[0]
      if (ex) continue

      await client.query(
        `INSERT INTO financial_entries (clinic_id, type, description, amount, due_date, payment_date, status, source, category, tutor_id, patient_id, notes)
         VALUES ($1,'receivable',$2,$3,$4,$5,'paid','petlove','Convênios · Petlove',$6,$7,$8)`,
        [remRow.clinic_id, description, repass > 0 ? repass : 0.01, line.service_date, remRow.period_end, line.matched_tutor_id, line.matched_patient_id, notes]
      )
      entriesCreated++
      totalAmount += repass
    }
    console.log(`  → ${entriesCreated} financial_entries individuais criados (R$ ${totalAmount.toFixed(2)})\n`)

    // Status remessa
    await client.query(`UPDATE petlove_remittances SET status='reconciled', reconciled_at=now() WHERE id=$1`, [remRow.id])

    await client.query('COMMIT')

    console.log('═══════════════════════════════════════════')
    console.log('✅ PIPELINE COMPLETO via script:')
    console.log(`   Pets criados: ${createdPets}`)
    console.log(`   Tutores criados: ${createdTutors}`)
    console.log(`   Pet_insurance criados: ${createdInsurance}`)
    console.log(`   Entries individuais: ${entriesCreated}`)
    console.log(`   Valor total: R$ ${totalAmount.toFixed(2)}`)
    console.log('═══════════════════════════════════════════')
    console.log('\nSe esses números aparecem aqui mas NÃO aparecem na tela web,')
    console.log('o problema é deployment (Vercel não rebuildou) ou cache do navegador.')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('❌ ROLLBACK por erro:', e.message)
    throw e
  }

  await client.end()
})().catch(e => { console.error(e); process.exit(1) })
