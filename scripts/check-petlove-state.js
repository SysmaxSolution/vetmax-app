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

  console.log('=== petlove_remittances (last 5) ===')
  const r = await client.query(`SELECT id, clinic_id, remittance_number, status, imported_at FROM petlove_remittances ORDER BY imported_at DESC LIMIT 5`)
  console.table(r.rows)

  if (r.rows.length > 0) {
    const remId = r.rows[0].id
    const clinicId = r.rows[0].clinic_id

    console.log(`\n=== match_status counts for remittance ${remId} ===`)
    const s = await client.query(`SELECT match_status, COUNT(*)::int as cnt, SUM(repass_value)::numeric(12,2) as total FROM petlove_remittance_lines WHERE remittance_id=$1 GROUP BY match_status ORDER BY cnt DESC`, [remId])
    console.table(s.rows)

    console.log('\n=== financial_entries source=petlove* (last 10) ===')
    const f = await client.query(`SELECT id, description, amount, status, source, tutor_id IS NOT NULL as has_tutor, patient_id IS NOT NULL as has_patient, created_at FROM financial_entries WHERE source IN ('petlove','petlove_indicacao') ORDER BY created_at DESC LIMIT 10`)
    console.table(f.rows)

    console.log('\n=== count entries by source for current clinic ===')
    const c1 = await client.query(`SELECT source, COUNT(*)::int as cnt FROM financial_entries WHERE source IN ('petlove','petlove_indicacao') AND clinic_id=$1 GROUP BY source`, [clinicId])
    console.table(c1.rows)

    console.log('\n=== patients created_from=petlove_import ===')
    const p = await client.query(`SELECT id, name, species, tutor_id IS NOT NULL as has_tutor, clinic_id, created_at FROM patients WHERE created_from='petlove_import' ORDER BY created_at DESC LIMIT 15`)
    console.table(p.rows)

    console.log('\n=== count patients by clinic and species ===')
    const c2 = await client.query(`SELECT clinic_id, species, COUNT(*)::int as cnt FROM patients WHERE created_from='petlove_import' GROUP BY clinic_id, species ORDER BY clinic_id`)
    console.table(c2.rows)

    console.log('\n=== current clinic_id of the remittance ===')
    console.log(`  Remittance clinic_id: ${clinicId}`)

    console.log('\n=== sample line for that remittance (first matched_patient_id) ===')
    const sample = await client.query(`SELECT id, match_status, matched_patient_id, matched_tutor_id, pet_name_raw, tutor_name_raw, procedure_name_raw, repass_value FROM petlove_remittance_lines WHERE remittance_id=$1 ORDER BY service_date LIMIT 5`, [remId])
    console.table(sample.rows)
  }

  await client.end()
})().catch(e => { console.error(e); process.exit(1) })
