// Teste end-to-end do parser + stage da remessa "em aberto".
// Não chama o server action porque depende de Next/cookies — chama
// diretamente as funções de baixo nível contra o banco remoto.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import ExcelJS from 'exceljs'

const envContent = readFileSync('.env.local', 'utf8')
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const SERVICE_KEY  = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltam credenciais Supabase em .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const FILE = 'C:/Users/djham/Downloads/DOC-20260521-WA0031..xlsx'

// Pegamos a primeira clínica que tem o módulo petlove_reconciliation ativo
async function pickClinic() {
  const { data: clinics } = await supabase
    .from('clinics')
    .select('id, name, active_modules')
  const target = (clinics ?? []).find(c =>
    Array.isArray(c.active_modules) && c.active_modules.includes('petlove_reconciliation')
  ) ?? (clinics ?? [])[0]
  if (!target) throw new Error('Nenhuma clínica encontrada para testar.')
  console.log(`▶ Clínica de teste: ${target.name} (${target.id})`)
  return target.id
}

// ─── Parser inline (mesma lógica do petlove-import.ts) ─────────────────────────
function normalizeLabel(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase()
}
function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
function toIsoDate(v) {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? iso[0] : null
}
function cellText(v) {
  if (v == null) return null
  if (typeof v === 'object') {
    if (v.text) return String(v.text).trim() || null
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('').trim() || null
    if (v.result !== undefined) return String(v.result).trim() || null
  }
  const s = String(v).trim()
  return s.length ? s : null
}

async function parseOpenXlsx(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const sheet = wb.worksheets[0]

  const header = sheet.getRow(1)
  const colIndex = {}
  header.eachCell((cell, c) => {
    const lbl = normalizeLabel(cellText(cell.value))
    if (lbl) colIndex[lbl] = c
  })
  const find = (...labels) => {
    for (const l of labels) if (colIndex[normalizeLabel(l)]) return colIndex[normalizeLabel(l)]
    return undefined
  }
  const COL = {
    appt: find('Atendimento'),
    date: find('Data de Realização', 'Data de Realizacao'),
    tutor: find('Nome do Cliente'),
    pet: find('Nome do Pet'),
    species: find('Especie', 'Espécie'),
    breed: find('Raça do pet', 'Raca do pet'),
    gender: find('Genero', 'Gênero'),
    plan: find('Plano do pet'),
    chip: find('Microchip'),
    member: find('Matricula', 'Matrícula'),
    vet: find('Veterinário'),
    proc: find('Procedimento'),
    statusP: find('Status Procedimento'),
    repass: find('Valor_Repasse'),
    copart: find('Valor_Copart'),
    statusF: find('Status Financeiro'),
  }

  const lines = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const apptId = cellText(row.getCell(COL.appt).value)
    if (!apptId) continue
    const isoDate = toIsoDate(row.getCell(COL.date).value)
    if (!isoDate) continue
    const chipRaw = COL.chip ? cellText(row.getCell(COL.chip).value) : null
    const chip = chipRaw ? (chipRaw.startsWith('#') ? chipRaw : `#${chipRaw.replace(/^#/, '')}`) : null

    lines.push({
      external_appointment_id: apptId,
      service_date:            isoDate,
      tutor_name_raw:          COL.tutor ? cellText(row.getCell(COL.tutor).value) : null,
      pet_name_raw:            COL.pet ? cellText(row.getCell(COL.pet).value) : null,
      species_raw:             COL.species ? cellText(row.getCell(COL.species).value) : null,
      breed_raw:               COL.breed ? cellText(row.getCell(COL.breed).value) : null,
      plan_name_raw:           COL.plan ? cellText(row.getCell(COL.plan).value) : null,
      microchip_raw:           chip,
      membership_id_raw:       COL.member ? cellText(row.getCell(COL.member).value) : null,
      veterinarian_raw:        COL.vet ? cellText(row.getCell(COL.vet).value) : null,
      procedure_name_raw:      COL.proc ? cellText(row.getCell(COL.proc).value) : null,
      repass_value:            toNumber(row.getCell(COL.repass).value),
      coparticipation_value:   COL.copart ? toNumber(row.getCell(COL.copart).value) : 0,
      gender_raw:              COL.gender ? cellText(row.getCell(COL.gender).value) : null,
      procedure_status_raw:    COL.statusP ? cellText(row.getCell(COL.statusP).value) : null,
      financial_status_raw:    COL.statusF ? cellText(row.getCell(COL.statusF).value) : null,
    })
  }

  if (lines.length === 0) throw new Error('sem linhas')
  const sortedDates = lines.map(l => l.service_date).sort()
  const period_start = sortedDates[0]
  const period_end = sortedDates[sortedDates.length - 1]
  const [y, m] = period_end.split('-')
  const remittance_number = `OPEN-${y}${m}`

  return {
    remittance_number, period_start, period_end,
    total_service_value: lines.reduce((a, l) => a + l.repass_value, 0),
    total_gross_value:   lines.reduce((a, l) => a + l.repass_value + l.coparticipation_value, 0),
    lines,
  }
}

async function main() {
  const clinicId = await pickClinic()
  const parsed = await parseOpenXlsx(FILE)
  console.log(`▶ Parser: ${parsed.lines.length} linhas, número=${parsed.remittance_number}, período ${parsed.period_start} → ${parsed.period_end}`)

  // Provider
  const { data: existingProv } = await supabase
    .from('insurance_providers')
    .select('id')
    .eq('clinic_id', clinicId)
    .ilike('name', 'petlove')
    .maybeSingle()
  let providerId = existingProv?.id
  if (!providerId) {
    const { data: newProv, error } = await supabase
      .from('insurance_providers')
      .insert({ clinic_id: clinicId, name: 'Petlove', plan_types: ['Leve','Ideal','Tranquilo','Premium'], is_active: true })
      .select('id').single()
    if (error) throw error
    providerId = newProv.id
  }
  console.log(`▶ Provider: ${providerId}`)

  // Limpa qualquer remessa OPEN anterior do teste para isolar
  const { data: oldOpen } = await supabase
    .from('petlove_remittances').select('id')
    .eq('clinic_id', clinicId).eq('remittance_number', parsed.remittance_number)
  if (oldOpen && oldOpen.length > 0) {
    console.log(`▶ Limpando ${oldOpen.length} remessa(s) OPEN anterior(es)...`)
    for (const r of oldOpen) {
      await supabase.from('petlove_remittance_lines').delete().eq('remittance_id', r.id)
      await supabase.from('petlove_remittances').delete().eq('id', r.id)
    }
  }

  // 1ª importação
  console.log('\n▶ TESTE 1: primeira importação')
  const { data: r1, error: e1 } = await supabase
    .from('petlove_remittances')
    .insert({
      clinic_id: clinicId, provider_id: providerId,
      remittance_number: parsed.remittance_number,
      period_start: parsed.period_start, period_end: parsed.period_end,
      status: 'open', is_preview: true, source_format: 'open',
      total_service_value: Number(parsed.total_service_value.toFixed(2)),
      total_gross_value: Number(parsed.total_gross_value.toFixed(2)),
      raw_summary: { source: 'open_format' },
    })
    .select('id').single()
  if (e1) throw e1
  console.log(`  ✓ remessa criada: ${r1.id}`)

  const payload = parsed.lines.map(l => ({
    clinic_id: clinicId, remittance_id: r1.id,
    external_appointment_id: l.external_appointment_id,
    service_date: l.service_date,
    tutor_name_raw: l.tutor_name_raw, pet_name_raw: l.pet_name_raw,
    species_raw: l.species_raw, breed_raw: l.breed_raw,
    plan_name_raw: l.plan_name_raw, microchip_raw: l.microchip_raw,
    membership_id_raw: l.membership_id_raw, veterinarian_raw: l.veterinarian_raw,
    procedure_name_raw: l.procedure_name_raw,
    repass_value: l.repass_value, coparticipation_value: l.coparticipation_value,
    gender_raw: l.gender_raw,
    procedure_status_raw: l.procedure_status_raw,
    financial_status_raw: l.financial_status_raw,
    match_status: 'pending',
  }))
  const { error: e2 } = await supabase.from('petlove_remittance_lines').insert(payload)
  if (e2) throw e2
  console.log(`  ✓ ${payload.length} linhas inseridas`)

  // Lê de volta
  const { data: check } = await supabase
    .from('petlove_remittance_lines')
    .select('gender_raw, procedure_status_raw, financial_status_raw, microchip_raw')
    .eq('remittance_id', r1.id)
    .limit(3)
  console.log('  amostra:', JSON.stringify(check, null, 2))

  // 2ª importação (sobrescrita)
  console.log('\n▶ TESTE 2: sobrescrita (apaga linhas e regrava)')
  await supabase.from('petlove_remittance_lines').delete().eq('remittance_id', r1.id)
  await supabase.from('petlove_remittances').update({
    period_start: parsed.period_start, period_end: parsed.period_end,
    status: 'open', is_preview: true, source_format: 'open',
    total_service_value: Number(parsed.total_service_value.toFixed(2)),
    total_gross_value: Number(parsed.total_gross_value.toFixed(2)),
    imported_at: new Date().toISOString(),
  }).eq('id', r1.id)
  const { error: e3 } = await supabase.from('petlove_remittance_lines').insert(payload)
  if (e3) throw e3
  console.log(`  ✓ ${payload.length} linhas reinseridas no mesmo header ${r1.id}`)

  // Limpeza
  console.log('\n▶ Limpando dados de teste...')
  await supabase.from('petlove_remittance_lines').delete().eq('remittance_id', r1.id)
  await supabase.from('petlove_remittances').delete().eq('id', r1.id)
  console.log('  ✓ rollback completo')

  console.log('\n✅ E2E passou: parser + insert/overwrite/cleanup OK.')
}

main().catch(e => { console.error('\n✗ Erro:', e); process.exit(1) })
