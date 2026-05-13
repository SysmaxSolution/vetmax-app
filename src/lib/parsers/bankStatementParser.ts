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
// usa biblioteca xlsx (SheetJS)

async function parseXLSX(buffer: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  const wb   = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  if (!rows.length) return { statements: [], errors: ['Planilha vazia.'] }

  const statements: ParsedStatement[] = []
  const errors: string[] = []

  const headers = Object.keys(rows[0]).map(h => h.toLowerCase())
  const idxDate  = headers.findIndex(h => h.includes('data') || h === 'date')
  const idxDesc  = headers.findIndex(h => h.includes('desc') || h.includes('memo') || h.includes('histor'))
  const idxAmt   = headers.findIndex(h => h.includes('valor') || h === 'value' || h === 'amount')

  const origHeaders = Object.keys(rows[0])

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      const rawDate = idxDate >= 0 ? row[origHeaders[idxDate]] : null
      const rawAmt  = idxAmt  >= 0 ? row[origHeaders[idxAmt]]  : null
      const desc    = idxDesc >= 0 ? String(row[origHeaders[idxDesc]] || 'Sem descrição') : 'Sem descrição'

      if (!rawDate || rawAmt === null || rawAmt === '') continue

      // Data pode ser JS Date (xlsx com cellDates), string, ou number
      let date: string
      if (rawDate instanceof Date) {
        date = rawDate.toISOString().split('T')[0]
      } else if (typeof rawDate === 'number') {
        // Número serial do Excel
        const d = XLSX.SSF.parse_date_code(rawDate)
        date = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
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
        errors.push(`Linha ${i + 2}: valor inválido`)
        continue
      }

      statements.push({
        date,
        amount:      Math.abs(amount),
        description: desc,
        type:        amount >= 0 ? 'credit' : 'debit',
      })
    } catch {
      errors.push(`Linha ${i + 2}: erro ao parsear`)
    }
  }

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
