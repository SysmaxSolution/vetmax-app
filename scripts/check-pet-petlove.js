/**
 * Inspeciona um pet criado via bulk register Petlove para entender
 * quais colunas estão NULL vs preenchidas + custom_prices vinculados.
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

  // Pega 1 pet recém-criado
  const pet = (await client.query(`
    SELECT id, name, species, breed, gender, neutered, birth_date, microchip_id, microchip, notes, created_from, tutor_id, clinic_id, created_at
    FROM patients WHERE created_from='petlove_import' ORDER BY created_at DESC LIMIT 3`)).rows
  console.log('=== Pets criados via petlove_import (últimos 3) ===')
  console.table(pet)

  if (pet.length > 0) {
    const tutorId = pet[0].tutor_id
    const tutor = (await client.query(`SELECT id, name, cpf, phone, email, created_from FROM tutors WHERE id=$1`, [tutorId])).rows[0]
    console.log('\n=== Tutor do 1º pet ===')
    console.table([tutor])

    console.log('\n=== patient_custom_prices vinculados ao 1º pet ===')
    const cp = (await client.query(`
      SELECT pcp.custom_price, pcp.source, pcp.observation_count, s.name as service_name
      FROM patient_custom_prices pcp JOIN stock_items s ON s.id=pcp.stock_item_id
      WHERE pcp.patient_id=$1`, [pet[0].id])).rows
    console.table(cp)

    console.log(`\nTotal custom_prices na clínica: ${(await client.query(`SELECT COUNT(*)::int as cnt FROM patient_custom_prices WHERE clinic_id=$1`, [pet[0].clinic_id])).rows[0].cnt}`)
    console.log(`Stock items petlove (is_service=true): ${(await client.query(`SELECT COUNT(*)::int as cnt FROM stock_items WHERE clinic_id=$1 AND is_service=true`, [pet[0].clinic_id])).rows[0].cnt}`)
  }

  await client.end()
})().catch(e => { console.error(e); process.exit(1) })
