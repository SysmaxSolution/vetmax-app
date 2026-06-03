// petlove-merge-duplicate-pets.mjs
// Mescla um pet duplicado (criado via importação Petlove) no pet original.
// Move TODAS as referências (consultations, financial_entries, custom_prices,
// pet_insurance, petlove_remittance_lines, patient_petlove_history) para o
// original, herda chip+plano do duplicado se o original estiver vazio, e
// remove o duplicado.
//
// Default = DRY-RUN. Exige --apply para gravar.
//
// Uso:
//   node scripts/petlove-merge-duplicate-pets.mjs \
//     --duplicate=<uuid_duplicado> --into=<uuid_original>
//
//   node scripts/petlove-merge-duplicate-pets.mjs \
//     --duplicate=<uuid_duplicado> --into=<uuid_original> --apply

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim()
const m = dbUrl.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/)
const [, user, pw, host, port, db] = m

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }),
)

const DUPLICATE = args.duplicate
const ORIGINAL  = args.into
const APPLY     = args.apply === true

if (!DUPLICATE || !ORIGINAL) {
  console.error('Uso: --duplicate=<uuid> --into=<uuid> [--apply]')
  process.exit(1)
}

const client = new pg.Client({
  user, password: decodeURIComponent(pw), host, port: +port, database: db,
  ssl: { rejectUnauthorized: false },
})

;(async () => {
  await client.connect()

  // Carrega ambos os pets para validar
  const { rows: pets } = await client.query(
    `SELECT id, clinic_id, name, tutor_id, microchip_id, microchip, created_from
     FROM patients WHERE id IN ($1, $2)`,
    [DUPLICATE, ORIGINAL],
  )
  const dup  = pets.find(p => p.id === DUPLICATE)
  const orig = pets.find(p => p.id === ORIGINAL)

  if (!dup)  throw new Error(`Pet duplicado ${DUPLICATE} não encontrado.`)
  if (!orig) throw new Error(`Pet original ${ORIGINAL} não encontrado.`)
  if (dup.clinic_id !== orig.clinic_id) {
    throw new Error(`Pets em clínicas diferentes — dup=${dup.clinic_id} orig=${orig.clinic_id}.`)
  }

  console.log(`Modo: ${APPLY ? 'APPLY (vai gravar)' : 'DRY-RUN'}`)
  console.log(`Original ${orig.id} — "${orig.name}" — chip "${orig.microchip_id ?? orig.microchip ?? ''}"`)
  console.log(`Duplicado ${dup.id} — "${dup.name}" — chip "${dup.microchip_id ?? dup.microchip ?? ''}"`)

  // Conta os registros que serão movidos
  const counts = {}
  for (const [label, sql] of [
    ['consultations',          `SELECT COUNT(*)::int FROM consultations          WHERE patient_id = $1`],
    ['financial_entries',      `SELECT COUNT(*)::int FROM financial_entries      WHERE patient_id = $1`],
    ['patient_custom_prices',  `SELECT COUNT(*)::int FROM patient_custom_prices  WHERE patient_id = $1`],
    ['pet_insurance',          `SELECT COUNT(*)::int FROM pet_insurance          WHERE patient_id = $1`],
    ['petlove_remittance_lines', `SELECT COUNT(*)::int FROM petlove_remittance_lines WHERE matched_patient_id = $1`],
    ['patient_petlove_history',  `SELECT COUNT(*)::int FROM patient_petlove_history  WHERE patient_id = $1`],
  ]) {
    const { rows } = await client.query(sql, [DUPLICATE])
    counts[label] = rows[0].count
  }
  console.log('\nA mover do duplicado para o original:')
  console.table(counts)

  // O chip do duplicado vai para o original SE este estiver vazio
  const origChip = (orig.microchip_id ?? orig.microchip ?? '').replace(/^#/, '').trim()
  const dupChip  = (dup.microchip_id  ?? dup.microchip  ?? '').replace(/^#/, '').trim()
  const willFillChip = !origChip && dupChip
  if (willFillChip) {
    console.log(`Original sem chip — vai receber "${dupChip}" do duplicado.`)
  } else if (origChip && dupChip && origChip !== dupChip) {
    console.log(`⚠ Original já tem chip "${origChip}" diferente do duplicado "${dupChip}". Chip NÃO será sobrescrito.`)
  }

  if (!APPLY) {
    console.log('\nDRY-RUN — nada foi gravado. Re-execute com --apply para aplicar.')
    await client.end()
    return
  }

  // ─── Transação de merge ─────────────────────────────────────────────────────
  await client.query('BEGIN')
  try {
    // 1) Reapontar consultas
    await client.query(`UPDATE consultations SET patient_id = $1 WHERE patient_id = $2`, [ORIGINAL, DUPLICATE])

    // 2) Reapontar financial_entries
    await client.query(`UPDATE financial_entries SET patient_id = $1 WHERE patient_id = $2`, [ORIGINAL, DUPLICATE])

    // 3) Reapontar petlove_remittance_lines.matched_patient_id
    await client.query(`UPDATE petlove_remittance_lines SET matched_patient_id = $1 WHERE matched_patient_id = $2`, [ORIGINAL, DUPLICATE])

    // 4) Mover patient_petlove_history
    await client.query(`UPDATE patient_petlove_history SET patient_id = $1 WHERE patient_id = $2`, [ORIGINAL, DUPLICATE])

    // 5) patient_custom_prices: pode haver conflito por (clinic_id, patient_id, stock_item_id)
    //    Para cada linha do duplicado, se existir uma equivalente do original mantém a do original;
    //    senão reaponta. Aqui usamos a coluna ASSIM no INSERT ON CONFLICT DO NOTHING.
    await client.query(`
      INSERT INTO patient_custom_prices
        (clinic_id, patient_id, stock_item_id, custom_price, source, provider_id,
         last_remittance_id, last_seen_at, observation_count)
      SELECT clinic_id, $1, stock_item_id, custom_price, source, provider_id,
             last_remittance_id, last_seen_at, observation_count
      FROM patient_custom_prices
      WHERE patient_id = $2
      ON CONFLICT (clinic_id, patient_id, stock_item_id) DO NOTHING
    `, [ORIGINAL, DUPLICATE])
    await client.query(`DELETE FROM patient_custom_prices WHERE patient_id = $1`, [DUPLICATE])

    // 6) pet_insurance: idem — se o original já tem (clinic_id, patient_id, provider_id), mantém;
    //    se não, copia do duplicado e marca o do duplicado para deleção.
    const { rows: dupIns } = await client.query(
      `SELECT id, provider_id, plan_type, member_id, coverage_status, notes
       FROM pet_insurance WHERE patient_id = $1`, [DUPLICATE])
    for (const ins of dupIns) {
      const { rows: existing } = await client.query(
        `SELECT id FROM pet_insurance
         WHERE patient_id = $1 AND provider_id = $2 LIMIT 1`,
        [ORIGINAL, ins.provider_id])
      if (existing.length === 0) {
        await client.query(
          `INSERT INTO pet_insurance (clinic_id, patient_id, tutor_id, provider_id, plan_type, member_id, coverage_status, notes)
           SELECT clinic_id, $1, tutor_id, provider_id, plan_type, member_id, coverage_status, notes
           FROM pet_insurance WHERE id = $2`,
          [ORIGINAL, ins.id])
      }
    }
    await client.query(`DELETE FROM pet_insurance WHERE patient_id = $1`, [DUPLICATE])

    // 7) Atualiza chip do original se estava vazio
    if (willFillChip) {
      await client.query(
        `UPDATE patients SET microchip_id = $1, microchip = $1 WHERE id = $2`,
        [dupChip, ORIGINAL])
    }

    // 8) Deleta o duplicado
    await client.query(`DELETE FROM patients WHERE id = $1`, [DUPLICATE])

    await client.query('COMMIT')
    console.log('\n✅ Merge aplicado com sucesso.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Erro durante o merge — rollback executado:', err.message)
    process.exit(1)
  }

  await client.end()
})().catch(err => {
  console.error(err)
  process.exit(1)
})
