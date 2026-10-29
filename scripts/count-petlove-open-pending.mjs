import ExcelJS from 'exceljs'

const FILE = 'C:/Users/djham/Downloads/DOC-20260521-WA0031..xlsx'

function normLabel(s) {
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
  appt:    find('Atendimento'),
  date:    find('Data de Realização'),
  proc:    find('Procedimento'),
  statusP: find('Status Procedimento'),
  statusF: find('Status Financeiro'),
  repass:  find('Valor_Repasse'),
  copart:  find('Valor_Copart'),
}

let totalRows = 0
let liberadoCount = 0, liberadoSum = 0
let emAnaliseCount = 0, emAnaliseSum = 0
let repassZero = 0
let elegivelCount = 0, elegivelSum = 0  // Liberado + repass>0 (que viram pending)
let coparticpacaoSum = 0
const procBreakdown = new Map()

for (let r = 2; r <= sheet.rowCount; r++) {
  const row = sheet.getRow(r)
  const apptId = cellText(row.getCell(COL.appt).value)
  if (!apptId) continue
  totalRows++

  const statusP = cellText(row.getCell(COL.statusP).value) ?? ''
  const repass  = toNumber(row.getCell(COL.repass).value)
  const copart  = toNumber(row.getCell(COL.copart).value)
  const proc    = cellText(row.getCell(COL.proc).value) ?? ''

  coparticpacaoSum += copart

  if (statusP.toLowerCase().includes('liberado')) {
    liberadoCount++
    liberadoSum += repass
    if (repass > 0) {
      elegivelCount++
      elegivelSum += repass
      const cur = procBreakdown.get(proc) ?? { count: 0, sum: 0 }
      cur.count++
      cur.sum += repass
      procBreakdown.set(proc, cur)
    } else {
      repassZero++
    }
  } else if (statusP.toLowerCase().includes('analise') || statusP.toLowerCase().includes('análise')) {
    emAnaliseCount++
    emAnaliseSum += repass
  }
}

console.log('═════════════════════════════════════════════════════════════')
console.log('  PLANILHA EM ABERTO — DOC-20260521-WA0031.xlsx')
console.log('═════════════════════════════════════════════════════════════')
console.log(`Total de linhas (atendimentos):        ${totalRows}`)
console.log()
console.log('─── Status Procedimento ────────────────────────────────────')
console.log(`  Liberado:                            ${liberadoCount} linhas · repasse R$ ${liberadoSum.toFixed(2)}`)
console.log(`  Em análise:                          ${emAnaliseCount} linhas · repasse R$ ${emAnaliseSum.toFixed(2)}`)
console.log()
console.log('─── Filtro adicional: repass > 0 ──────────────────────────')
console.log(`  Liberado com repasse = 0 (excluídos):  ${repassZero} linhas`)
console.log()
console.log('═══════════════════════════════════════════════════════════')
console.log(`✅ LANÇAMENTOS A SEREM CRIADOS COMO "A RECEBER EM ABERTO":`)
console.log(`   ${elegivelCount} contas a receber pendentes`)
console.log(`   Total: R$ ${elegivelSum.toFixed(2)}`)
console.log('═══════════════════════════════════════════════════════════')
console.log()
console.log('─── Coparticipação (já recebida no caixa, não vira pending) ───')
console.log(`  R$ ${coparticpacaoSum.toFixed(2)} (paga pelo tutor no atendimento)`)
console.log()
console.log('─── Top 10 procedimentos no total a receber ──────────────')
const top = Array.from(procBreakdown.entries()).sort((a, b) => b[1].sum - a[1].sum).slice(0, 10)
for (const [p, v] of top) {
  console.log(`  ${p.slice(0, 50).padEnd(50)} ${String(v.count).padStart(3)}× · R$ ${v.sum.toFixed(2).padStart(10)}`)
}
