// Teste isolado do parser sem dependências de Supabase/Next.
// Reimplementa apenas as helpers + parser para validar as 3 planilhas.

import ExcelJS from 'exceljs'

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
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    const [, dd, mm, yyyy] = m
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  return null
}
function cellText(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    if (v.text) return String(v.text).trim() || null
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('').trim() || null
    if (v.result !== undefined) return String(v.result).trim() || null
  }
  const s = String(v).trim()
  return s.length ? s : null
}
function isOpenFormatSheet(ws) {
  if (ws.rowCount < 2) return false
  const headers = []
  ws.getRow(1).eachCell((cell) => {
    const t = cellText(cell.value)
    if (t) headers.push(normalizeLabel(t))
  })
  const joined = headers.join('|')
  return /valor[_ ]repasse/.test(joined) && /valor[_ ]copart/.test(joined) && /atendimento/.test(joined)
}

async function parse(path) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)

  const resumoSheet  = wb.worksheets.find(ws => /resumo/i.test(ws.name))
  const extratoSheet = wb.worksheets.find(ws => /extrato/i.test(ws.name))

  if (resumoSheet && extratoSheet) {
    return parseClosed(resumoSheet, extratoSheet)
  }
  const openSheet = wb.worksheets.find(ws => isOpenFormatSheet(ws))
  if (openSheet) return parseOpen(openSheet)
  return { error: 'fora do padrão' }
}

function parseClosed(resumo, extrato) {
  const summary = {}
  resumo.eachRow(row => {
    const label = cellText(row.getCell(1).value)
    const value = row.getCell(2).value
    if (!label) return
    summary[normalizeLabel(label)] = typeof value === 'number' ? value : (cellText(value) ?? '')
  })
  const remittance_number = String(summary[normalizeLabel('Informações da Remessa')] ?? '').trim()
  const periodoRaw = String(summary[normalizeLabel('Referente ao período')] ?? '')
  const periodoMatch = periodoRaw.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*a\s*(\d{1,2}\/\d{1,2}\/\d{4})/)
  const period_start = periodoMatch ? toIsoDate(periodoMatch[1]) : null
  const period_end   = periodoMatch ? toIsoDate(periodoMatch[2]) : null

  const header = extrato.getRow(1)
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
    date: find('Data do Atendimento'),
    proc: find('Procedimento'),
    repass: find('Valor Repasse'),
  }
  let count = 0
  for (let r = 2; r <= extrato.rowCount; r++) {
    if (cellText(extrato.getRow(r).getCell(COL.appt).value)) count++
  }
  return {
    format: 'closed',
    remittance_number,
    period_start, period_end,
    status_raw: String(summary[normalizeLabel('Status da Remessa')] ?? ''),
    total_gross_value: toNumber(summary[normalizeLabel('Valor Total Bruto')]),
    lines_count: count,
  }
}

function parseOpen(sheet) {
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
    appt:   find('Atendimento'),
    date:   find('Data de Realização', 'Data de Realizacao', 'Data do Atendimento'),
    chip:   find('Microchip'),
    gender: find('Genero', 'Gênero'),
    proc:   find('Procedimento'),
    repass: find('Valor_Repasse', 'Valor Repasse'),
    copart: find('Valor_Copart', 'Valor Coparticipação'),
    statusP: find('Status Procedimento'),
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
      appt: apptId,
      date: isoDate,
      chip,
      gender: COL.gender ? cellText(row.getCell(COL.gender).value) : null,
      proc: cellText(row.getCell(COL.proc).value),
      repass: toNumber(row.getCell(COL.repass).value),
      copart: COL.copart ? toNumber(row.getCell(COL.copart).value) : 0,
      sp: COL.statusP ? cellText(row.getCell(COL.statusP).value) : null,
      sf: COL.statusF ? cellText(row.getCell(COL.statusF).value) : null,
    })
  }
  if (lines.length === 0) return { error: 'sem linhas' }
  const dates = lines.map(l => l.date).sort()
  const period_start = dates[0]
  const period_end = dates[dates.length - 1]
  const [y, m] = period_end.split('-')
  const remittance_number = `OPEN-${y}${m}`
  const total_gross = lines.reduce((a, l) => a + l.repass + l.copart, 0)
  const sample = lines[0]
  return {
    format: 'open',
    remittance_number,
    period_start, period_end,
    lines_count: lines.length,
    total_gross_value: Number(total_gross.toFixed(2)),
    sample_line: sample,
    distinct_status_proc: Array.from(new Set(lines.map(l => l.sp))),
    distinct_status_fin: Array.from(new Set(lines.map(l => l.sf))),
    distinct_genders: Array.from(new Set(lines.map(l => l.gender))).filter(Boolean),
  }
}

const FILES = [
  'C:/Users/djham/Downloads/126516-almavet-clinica-veterinaria-26-Mar-2026 (1).xlsx',
  'C:/Users/djham/Downloads/126516-almavet-clinica-veterinaria-22-Apr-2026-11-06-36 (1).xlsx',
  'C:/Users/djham/Downloads/DOC-20260521-WA0031..xlsx',
]
for (const f of FILES) {
  console.log('\n=== ', f.split('/').pop())
  const r = await parse(f)
  console.log(JSON.stringify(r, null, 2))
}
