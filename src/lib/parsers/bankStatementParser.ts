// ─── Parser de extratos bancários ─────────────────────────────────────────────
// Suporta: OFX, CSV, TXT (Bradesco/Itaú layout fixo), XLSX

export interface ParsedStatement {
  external_id?: string
  date:         string  // YYYY-MM-DD
  amount:       number  // sempre positivo
  description:  string
  type:         'credit' | 'debit'
}

export interface ParseResult {
  statements: ParsedStatement[]
  errors:     string[]
}

// ─── OFX ─────────────────────────────────────────────────────────────────────

function parseOFX(text: string): ParseResult {
  const statements: ParsedStatement[] = []
  const errors: string[] = []

  // OFX usa um formato SGML-like. Extraímos cada bloco <STMTTRN>
  const blocks = text.split(/<STMTTRN>/i).slice(1)

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    try {
      const dtPosted = block.match(/<DTPOSTED>\s*(\d{8})/i)?.[1]
      const trnAmt   = block.match(/<TRNAMT>\s*([+-]?[\d.,]+)/i)?.[1]
      const memo     = block.match(/<MEMO>\s*([^\n<]+)/i)?.[1]?.trim()
      const fitId    = block.match(/<FITID>\s*([^\n<]+)/i)?.[1]?.trim()
      const trnType  = block.match(/<TRNTYPE>\s*([A-Z]+)/i)?.[1]?.toUpperCase()

      if (!dtPosted || !trnAmt) {
        errors.push(`Bloco ${i + 1}: campos DTPOSTED ou TRNAMT ausentes`)
        continue
      }

      const year  = dtPosted.slice(0, 4)
      const month = dtPosted.slice(4, 6)
      const day   = dtPosted.slice(6, 8)
      const date  = `${year}-${month}-${day}`

      const amount = parseFloat(trnAmt.replace(',', '.'))
      if (isNaN(amount)) {
        errors.push(`Bloco ${i + 1}: valor inválido "${trnAmt}"`)
        continue
      }

      // CREDIT / DEP / INT = crédito; DEBIT / CHECK / ATM = débito
      // Se não tem TRNTYPE, usa sinal do valor
      let type: 'credit' | 'debit'
      if (trnType) {
        type = ['CREDIT', 'DEP', 'INT', 'DIV', 'DIRECTDEP'].includes(trnType) ? 'credit' : 'debit'
      } else {
        type = amount >= 0 ? 'credit' : 'debit'
      }

      statements.push({
        external_id: fitId || undefined,
        date,
        amount:      Math.abs(amount),
        description: memo || 'Sem descrição',
        type,
      })
    } catch (e) {
      errors.push(`Bloco ${i + 1}: erro ao parsear`)
    }
  }

  return { statements, errors }
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
// Colunas esperadas (case-insensitive): Data, Descrição, Valor
// Separadores: ; ou ,

function parseCSV(text: string): ParseResult {
  const statements: ParsedStatement[] = []
  const errors: string[] = []

  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) {
    return { statements: [], errors: ['Arquivo CSV vazio ou sem linhas de dados.'] }
  }

  // Detecta separador
  const sep = lines[0].includes(';') ? ';' : ','

  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
  const idxDate  = headers.findIndex(h => h.includes('data') || h === 'date')
  const idxDesc  = headers.findIndex(h => h.includes('desc') || h.includes('memo') || h.includes('historico') || h.includes('histórico'))
  const idxAmt   = headers.findIndex(h => h.includes('valor') || h === 'value' || h === 'amount')

  if (idxDate < 0 || idxAmt < 0) {
    return {
      statements: [],
      errors: ['Cabeçalho CSV inválido. Esperado: Data, Descrição, Valor'],
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
    if (cols.length < Math.max(idxDate, idxAmt) + 1) continue

    try {
      const rawDate = cols[idxDate]
      const rawAmt  = cols[idxAmt]
      const desc    = idxDesc >= 0 ? (cols[idxDesc] || 'Sem descrição') : 'Sem descrição'

      // Normaliza data: aceita dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
      let date: string
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        date = rawDate
      } else if (/^\d{2}[/\-]\d{2}[/\-]\d{4}$/.test(rawDate)) {
        const [day, month, year] = rawDate.split(/[/\-]/)
        date = `${year}-${month}-${day}`
      } else {
        errors.push(`Linha ${i + 1}: data inválida "${rawDate}"`)
        continue
      }

      const amount = parseFloat(rawAmt.replace(/\./g, '').replace(',', '.'))
      if (isNaN(amount)) {
        errors.push(`Linha ${i + 1}: valor inválido "${rawAmt}"`)
        continue
      }

      statements.push({
        date,
        amount:      Math.abs(amount),
        description: desc,
        type:        amount >= 0 ? 'credit' : 'debit',
      })
    } catch {
      errors.push(`Linha ${i + 1}: erro ao parsear`)
    }
  }

  return { statements, errors }
}

// ─── TXT (Bradesco / Itaú layout fixo) ───────────────────────────────────────
// Bradesco: posições 1-8 = data (DDMMAAAA), 9-18 = documento, 19-58 = histórico, 59-78 = valor
// Itaú:     posições 1-10 = data (DD/MM/YYYY), 11-50 = descrição, 51-68 = valor

function parseTXT(text: string): ParseResult {
  const statements: ParsedStatement[] = []
  const errors: string[] = []

  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 20)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    try {
      // Detecta se é Bradesco (data 8 chars sem separador) ou Itaú (DD/MM/YYYY)
      const isBradesco = /^\d{8}/.test(line.trim())
      const isItau     = /^\d{2}\/\d{2}\/\d{4}/.test(line.trim())

      let date: string
      let rawAmt: string
      let desc: string

      if (isBradesco && line.length >= 78) {
        const raw = line.trim()
        const dd   = raw.slice(0, 2)
        const mm   = raw.slice(2, 4)
        const yyyy = raw.slice(4, 8)
        date   = `${yyyy}-${mm}-${dd}`
        desc   = raw.slice(18, 58).trim()
        rawAmt = raw.slice(58, 78).trim()
      } else if (isItau && line.length >= 50) {
        const raw = line.trim()
        const [dd, mm, yyyy] = raw.slice(0, 10).split('/')
        date   = `${yyyy}-${mm}-${dd}`
        desc   = raw.slice(10, 50).trim()
        rawAmt = raw.slice(50).trim().split(/\s+/)[0]
      } else {
        // Ignora linhas que não se encaixam nos padrões
        continue
      }

      const amount = parseFloat(rawAmt.replace(/\./g, '').replace(',', '.'))
      if (isNaN(amount) || !date) continue

      statements.push({
        date,
        amount:      Math.abs(amount),
        description: desc || 'Sem descrição',
        type:        amount >= 0 ? 'credit' : 'debit',
      })
    } catch {
      errors.push(`Linha ${i + 1}: erro ao parsear`)
    }
  }

  return { statements, errors }
}

// ─── XLSX ─────────────────────────────────────────────────────────────────────
// usa exceljs (substituto seguro do SheetJS/xlsx — CVE GHSA-4r6h-8v6p-xvw6 e GHSA-5pgg-2g8v-p4x9)

function resolveCellValue(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && 'result' in (v as object))
    return resolveCellValue((v as Record<string, unknown>).result)
  if (typeof v === 'object' && 'richText' in (v as object))
    return (v as { richText: { text: string }[] }).richText.map(r => r.text).join('')
  return v
}

async function parseXLSX(buffer: ArrayBuffer): Promise<ParseResult> {
  const ExcelJS   = await import('exceljs')
  const workbook  = new ExcelJS.default.Workbook()
  // @ts-expect-error exceljs types predates Buffer<T> generic introduced in @types/node 22
  await workbook.xlsx.load(Buffer.from(new Uint8Array(buffer)))

  const worksheet = workbook.worksheets[0]
  if (!worksheet || worksheet.rowCount < 2) return { statements: [], errors: ['Planilha vazia.'] }

  const statements: ParsedStatement[] = []
  const errors: string[] = []

  const headerRow = worksheet.getRow(1)
  const headers: string[] = []
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(resolveCellValue(cell.value) ?? '').toLowerCase()
  })

  const idxDate = headers.findIndex(h => h.includes('data') || h === 'date')
  const idxDesc = headers.findIndex(h => h.includes('desc') || h.includes('memo') || h.includes('histor'))
  const idxAmt  = headers.findIndex(h => h.includes('valor') || h === 'value' || h === 'amount')

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return

    try {
      const rawDate = resolveCellValue(idxDate >= 0 ? row.getCell(idxDate + 1).value : null)
      const rawAmt  = resolveCellValue(idxAmt  >= 0 ? row.getCell(idxAmt  + 1).value : null)
      const rawDesc = resolveCellValue(idxDesc >= 0 ? row.getCell(idxDesc + 1).value : null)
      const desc    = rawDesc != null ? String(rawDesc) : 'Sem descrição'

      if (rawDate == null || rawAmt == null || rawAmt === '') return

      let date: string
      if (rawDate instanceof Date) {
        date = rawDate.toISOString().split('T')[0]
      } else {
        const s = String(rawDate).trim()
        if (/^\d{2}[/\-]\d{2}[/\-]\d{4}$/.test(s)) {
          const [dd, mm, yyyy] = s.split(/[/\-]/)
          date = `${yyyy}-${mm}-${dd}`
        } else {
          date = s
        }
      }

      const amount = parseFloat(String(rawAmt).replace(/\./g, '').replace(',', '.'))
      if (isNaN(amount)) {
        errors.push(`Linha ${rowNumber}: valor inválido`)
        return
      }

      statements.push({
        date,
        amount:      Math.abs(amount),
        description: desc,
        type:        amount >= 0 ? 'credit' : 'debit',
      })
    } catch {
      errors.push(`Linha ${rowNumber}: erro ao parsear`)
    }
  })

  return { statements, errors }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'ofx') {
    const text = await file.text()
    return parseOFX(text)
  }

  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text()
    if (ext === 'txt') return parseTXT(text)
    return parseCSV(text)
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer()
    return parseXLSX(buffer)
  }

  return {
    statements: [],
    errors: [`Formato não suportado: .${ext}. Use OFX, CSV, TXT ou XLSX.`],
  }
}
