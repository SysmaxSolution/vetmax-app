/**
 * Simula runMatchEngine direto no banco para a última remessa importada.
 * Identifica se o problema é: pets ausentes, RLS, query inválida, etc.
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

;(async () => {
  await client.connect()

  // Pega remessa mais recente
  const remRow = (await client.query(`SELECT id, clinic_id, status, remittance_number FROM petlove_remittances ORDER BY imported_at DESC LIMIT 1`)).rows[0]
  if (!remRow) { console.log('Nenhuma remessa.'); return await client.end() }

  console.log(`Remessa: #${remRow.remittance_number} (${remRow.id}) status=${remRow.status} clinic=${remRow.clinic_id}\n`)

  // Pega TODAS as linhas
  const lines = (await client.query(`SELECT id, microchip_raw, pet_name_raw, tutor_name_raw, match_status FROM petlove_remittance_lines WHERE remittance_id=$1 AND clinic_id=$2`, [remRow.id, remRow.clinic_id])).rows
  console.log(`Total linhas: ${lines.length}\n`)

  // Estatísticas de chips
  const chips = [...new Set(lines.map(l => normalizeChip(l.microchip_raw)).filter(Boolean))]
  const names = [...new Set(lines.map(l => normalizeName(l.pet_name_raw)).filter(Boolean))]
  console.log(`Chips distintos: ${chips.length}`)
  console.log(`Nomes distintos: ${names.length}`)
  console.log(`Linhas sem chip: ${lines.filter(l => !normalizeChip(l.microchip_raw)).length}`)
  console.log(`Linhas sem nome: ${lines.filter(l => !normalizeName(l.pet_name_raw)).length}\n`)

  // Quantos patients EXISTEM na clínica?
  const totalPatients = (await client.query(`SELECT COUNT(*)::int as cnt FROM patients WHERE clinic_id=$1`, [remRow.clinic_id])).rows[0]
  console.log(`Patients na clínica: ${totalPatients.cnt}`)

  // Patients com microchip
  const chippedPatients = (await client.query(`SELECT COUNT(*)::int as cnt FROM patients WHERE clinic_id=$1 AND (microchip_id IS NOT NULL OR microchip IS NOT NULL)`, [remRow.clinic_id])).rows[0]
  console.log(`Patients com microchip: ${chippedPatients.cnt}\n`)

  // Quantos chips da remessa batem com patients existentes?
  if (chips.length > 0) {
    const chipFilter = chips.flatMap(c => [c, `#${c}`])
    const matched = (await client.query(`SELECT COUNT(DISTINCT id)::int as cnt FROM patients WHERE clinic_id=$1 AND (microchip_id = ANY($2) OR microchip = ANY($2))`, [remRow.clinic_id, chipFilter])).rows[0]
    console.log(`Patients existentes que batem por chip: ${matched.cnt}`)
  }
  if (names.length > 0) {
    const matched = (await client.query(`SELECT COUNT(DISTINCT id)::int as cnt FROM patients WHERE clinic_id=$1 AND lower(name) = ANY($2)`, [remRow.clinic_id, names])).rows[0]
    console.log(`Patients existentes que batem por nome (lower): ${matched.cnt}`)
  }

  console.log('\n=== Esperado após matching ideal ===')
  console.log('Como Vet Teste não tem patients destes chips, TODAS as 153 linhas deveriam virar missing_patient_profile.')
  console.log('Em seguida bulkCreatePatientsFromPetlove deveria criar ~67 pets distintos.')
  console.log('Re-matching marcaria todas como matched.')
  console.log('applyReconciliation criaria 153 entries individuais.')

  // Status atual
  const statusBreakdown = (await client.query(`SELECT match_status, COUNT(*)::int as cnt FROM petlove_remittance_lines WHERE remittance_id=$1 GROUP BY match_status`, [remRow.id])).rows
  console.log('\n=== Status atual das linhas ===')
  console.table(statusBreakdown)

  await client.end()
})().catch(e => { console.error(e); process.exit(1) })
