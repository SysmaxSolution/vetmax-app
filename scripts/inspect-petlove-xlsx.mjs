import ExcelJS from 'exceljs'

async function inspect(path, maxRows = 20) {
  console.log('\n=================================================')
  console.log('FILE:', path)
  console.log('=================================================')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  for (const ws of wb.worksheets) {
    console.log('\n--- SHEET:', JSON.stringify(ws.name), 'rows=', ws.rowCount, 'cols=', ws.columnCount)
    const rows = Math.min(ws.rowCount, maxRows)
    for (let r = 1; r <= rows; r++) {
      const row = ws.getRow(r)
      const values = []
      const cols = Math.min(ws.columnCount, 18)
      for (let c = 1; c <= cols; c++) {
        const v = row.getCell(c).value
        let s
        if (v === null || v === undefined) s = ''
        else if (typeof v === 'object') {
          if (v instanceof Date) s = v.toISOString().slice(0,10)
          else if (v.text) s = String(v.text)
          else if (v.richText) s = v.richText.map(r => r.text).join('')
          else if (v.result !== undefined) s = String(v.result)
          else s = JSON.stringify(v).slice(0, 60)
        }
        else s = String(v)
        values.push(s.slice(0, 50))
      }
      console.log(`  R${r}: ${JSON.stringify(values)}`)
    }
  }
}

const args = process.argv.slice(2)
for (const a of args) {
  await inspect(a, 25)
}
