// Conta linhas elegíveis para pending entries DEPOIS do bulk-create automático.
// Ou seja: todas as linhas com Status Procedimento = "Liberado" + repass > 0
// E tutor_name_raw + pet_name_raw não-vazios (chave de bulk-create).
import ExcelJS from 'exceljs'

const FILE = 'C:/Users/djham/Downloads/DOC-20260521-WA0031..xlsx'

function normLabel(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase()
}
function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  return Number(String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
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

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(FILE)
const sheet = wb.worksheets[0]
const colIndex = {}
sheet.getRow(1).eachCell((cell, c) => {
  const lbl = normLabel(cellText(cell.value))
  if (lbl) colIndex[lbl] = c
})
const find = (...labels) => {
  for (const l of labels) if (colIndex[normLabel(l)]) return colIndex[normLabel(l)]
  return undefined
}
const COL = {
  appt: find('Atendimento'), date: find('Data de Realização'),
  tutor: find('Nome do Cliente'), pet: find('Nome do Pet'),
  chip: find('Microchip'), proc: find('Procedimento'),
  statusP: find('Status Procedimento'), repass: find('Valor_Repasse'),
}

let eligible = 0, eligibleSum = 0
const uniqueTutors = new Set()
const uniquePets = new Set()

for (let r = 2; r <= sheet.rowCount; r++) {
  const row = sheet.getRow(r)
  if (!cellText(row.getCell(COL.appt).value)) continue

  const statusP = cellText(row.getCell(COL.statusP).value) ?? ''
  const repass  = toNumber(row.getCell(COL.repass).value)
  const tutor   = cellText(row.getCell(COL.tutor).value)
  const pet     = cellText(row.getCell(COL.pet).value)
  const chip    = cellText(row.getCell(COL.chip).value)

  if (statusP.toLowerCase().includes('liberado') && repass > 0 && tutor && pet) {
    eligible++
    eligibleSum += repass
    uniqueTutors.add(tutor.toLowerCase())
    const petKey = chip ? `chip:${chip}` : `name:${pet.toLowerCase()}|tutor:${tutor.toLowerCase()}`
    uniquePets.add(petKey)
  }
}

console.log('═══════════════════════════════════════════════════════')
console.log('APÓS BULK-CREATE AUTOMÁTICO (com tutor + pet + repasse)')
console.log('═══════════════════════════════════════════════════════')
console.log(`Linhas elegíveis para entry pending: ${eligible}`)
console.log(`Total a receber:                     R$ ${eligibleSum.toFixed(2)}`)
console.log(`Tutores únicos na planilha:          ${uniqueTutors.size}`)
console.log(`Pets únicos na planilha:             ${uniquePets.size}`)
console.log()
console.log('Tutores e pets que NÃO estiverem cadastrados na clínica')
console.log('serão criados via bulk register antes de gerar os entries.')
