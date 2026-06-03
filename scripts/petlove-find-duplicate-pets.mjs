// petlove-find-duplicate-pets.mjs
// Identifica pets criados pela importação Petlove que provavelmente são
// duplicatas de cadastros já existentes (mesmo nome do pet + mesmo nome do
// tutor, dentro da mesma clínica).
//
// READ-ONLY. Apenas lista — não mescla nada.
//
// Uso:
//   node scripts/petlove-find-duplicate-pets.mjs                # todas as clínicas
//   node scripts/petlove-find-duplicate-pets.mjs <clinic_id>    # uma clínica específica

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim()
const m = dbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
const [, user, pw, host, port, db] = m

const client = new pg.Client({
  user, password: decodeURIComponent(pw), host, port: +port, database: db,
  ssl: { rejectUnauthorized: false },
})

const clinicFilter = process.argv[2]

;(async () => {
  await client.connect()

  // Detecta duplicatas: patient criado via petlove_import + outro patient
  // com mesma (clinic_id, nome normalizado do pet, nome normalizado do tutor).
  // Usa unaccent + lower para normalizar.
  const sql = `
    WITH pet_keys AS (
      SELECT
        p.id, p.clinic_id, p.name AS pet_name, p.created_from, p.created_at,
        p.microchip_id, p.microchip, p.tutor_id,
        t.name AS tutor_name,
        LOWER(UNACCENT(TRIM(p.name))) AS pet_key,
        LOWER(UNACCENT(TRIM(COALESCE(t.name, '')))) AS tutor_key
      FROM patients p
      LEFT JOIN tutors t ON t.id = p.tutor_id
      ${clinicFilter ? 'WHERE p.clinic_id = $1' : ''}
    ),
    duplicates AS (
      SELECT
        dup.id            AS duplicate_id,
        dup.pet_name      AS duplicate_pet_name,
        dup.tutor_name    AS duplicate_tutor_name,
        dup.created_at    AS duplicate_created_at,
        dup.microchip_id  AS duplicate_chip,
        orig.id           AS original_id,
        orig.pet_name     AS original_pet_name,
        orig.tutor_name   AS original_tutor_name,
        orig.created_at   AS original_created_at,
        orig.microchip_id AS original_chip,
        orig.created_from AS original_created_from,
        dup.clinic_id,
        dup.pet_key,
        dup.tutor_key
      FROM pet_keys dup
      JOIN pet_keys orig
        ON orig.clinic_id = dup.clinic_id
       AND orig.pet_key   = dup.pet_key
       AND orig.tutor_key = dup.tutor_key
       AND orig.id != dup.id
       AND (orig.created_from IS DISTINCT FROM 'petlove_import' OR orig.created_at < dup.created_at)
      WHERE dup.created_from = 'petlove_import'
        AND dup.pet_key   != ''
        AND dup.tutor_key != ''
    )
    SELECT
      d.*,
      c.name AS clinic_name,
      (SELECT COUNT(*) FROM consultations    WHERE patient_id = d.duplicate_id) AS dup_consults,
      (SELECT COUNT(*) FROM consultations    WHERE patient_id = d.original_id ) AS orig_consults,
      (SELECT COUNT(*) FROM financial_entries WHERE patient_id = d.duplicate_id) AS dup_entries,
      (SELECT COUNT(*) FROM financial_entries WHERE patient_id = d.original_id ) AS orig_entries,
      (SELECT COUNT(*) FROM petlove_remittance_lines WHERE matched_patient_id = d.duplicate_id) AS dup_petlove_lines,
      (SELECT COUNT(*) FROM petlove_remittance_lines WHERE matched_patient_id = d.original_id ) AS orig_petlove_lines
    FROM duplicates d
    LEFT JOIN clinics c ON c.id = d.clinic_id
    ORDER BY d.clinic_id, d.tutor_key, d.pet_key, d.duplicate_created_at;
  `

  const params = clinicFilter ? [clinicFilter] : []
  const r = await client.query(sql, params)

  if (r.rows.length === 0) {
    console.log('Nenhuma duplicata candidata encontrada.')
    await client.end()
    return
  }

  console.log(`\n${r.rows.length} duplicata(s) candidata(s):\n`)

  for (const row of r.rows) {
    console.log('━'.repeat(80))
    console.log(`Clínica: ${row.clinic_name} (${row.clinic_id})`)
    console.log(`Pet "${row.duplicate_pet_name}" — Tutor "${row.duplicate_tutor_name}"`)
    console.log()
    console.log(`  ORIGINAL ${row.original_id}`)
    console.log(`    nome do pet:   ${row.original_pet_name}`)
    console.log(`    nome do tutor: ${row.original_tutor_name}`)
    console.log(`    chip:          ${row.original_chip ?? '(vazio)'}`)
    console.log(`    criado em:     ${row.original_created_at.toISOString().slice(0,10)} (${row.original_created_from ?? 'manual'})`)
    console.log(`    consultas:     ${row.orig_consults}`)
    console.log(`    entries:       ${row.orig_entries}`)
    console.log(`    linhas pl:     ${row.orig_petlove_lines}`)
    console.log()
    console.log(`  DUPLICADO ${row.duplicate_id}  ← criado pela importação Petlove`)
    console.log(`    nome do pet:   ${row.duplicate_pet_name}`)
    console.log(`    nome do tutor: ${row.duplicate_tutor_name}`)
    console.log(`    chip:          ${row.duplicate_chip ?? '(vazio)'}`)
    console.log(`    criado em:     ${row.duplicate_created_at.toISOString().slice(0,10)}`)
    console.log(`    consultas:     ${row.dup_consults}`)
    console.log(`    entries:       ${row.dup_entries}`)
    console.log(`    linhas pl:     ${row.dup_petlove_lines}`)
    console.log()
    console.log(`  Para mesclar:`)
    console.log(`    node scripts/petlove-merge-duplicate-pets.mjs \\`)
    console.log(`      --duplicate=${row.duplicate_id} --into=${row.original_id}`)
  }

  console.log('\n' + '━'.repeat(80))
  console.log(`Total: ${r.rows.length} candidato(s) a merge.`)
  console.log('Revise cada par antes de executar petlove-merge-duplicate-pets.mjs.')

  await client.end()
})().catch(err => {
  console.error(err)
  process.exit(1)
})
