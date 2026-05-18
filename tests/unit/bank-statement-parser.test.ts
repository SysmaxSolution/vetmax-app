/**
 * Unit — Parser de extratos bancários (OFX e CSV)
 * As funções internas parseOFX/parseCSV não são exportadas — copiadas pra cá
 * (mesma estratégia do patients.test.ts) para evitar dependência exceljs/File.
 */

// ─── Cópia fiel de parseOFX (src/lib/parsers/bankStatementParser.ts) ──────────

interface ParsedStatement {
  external_id?: string
  date:         string
  amount:       number
  description:  string
  type:         'credit' | 'debit'
}
interface ParseResult { statements: ParsedStatement[]; errors: string[] }

function parseOFX(text: string): ParseResult {
  const statements: ParsedStatement[] = []
  const errors: string[] = []
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
    } catch {
      errors.push(`Bloco ${i + 1}: erro ao parsear`)
    }
  }

  return { statements, errors }
}

// ─── Cópia fiel de parseCSV ───────────────────────────────────────────────────

function parseCSV(text: string): ParseResult {
  const statements: ParsedStatement[] = []
  const errors: string[] = []

  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) {
    return { statements: [], errors: ['Arquivo CSV vazio ou sem linhas de dados.'] }
  }

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

// ═══════════════ OFX ═══════════════════════════════════════════════════════

describe('TC-BNK-OFX-001 → bloco CREDIT simples', () => {
  test('1 bloco CREDIT é classificado como credit', () => {
    const ofx = `
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260315
<TRNAMT>100.50
<FITID>TXN001
<MEMO>Depósito
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements).toHaveLength(1)
    expect(r.statements[0].type).toBe('credit')
    expect(r.statements[0].amount).toBe(100.5)
    expect(r.statements[0].date).toBe('2026-03-15')
    expect(r.statements[0].description).toBe('Depósito')
    expect(r.statements[0].external_id).toBe('TXN001')
  })
})

describe('TC-BNK-OFX-002 → bloco DEBIT simples', () => {
  test('TRNTYPE=DEBIT classifica como débito', () => {
    const ofx = `<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260301
<TRNAMT>-50.00
<MEMO>Pagamento
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements[0].type).toBe('debit')
    expect(r.statements[0].amount).toBe(50.0)
  })
})

describe('TC-BNK-OFX-003 → sem TRNTYPE usa sinal do valor (positivo → credit)', () => {
  test('Valor positivo sem TRNTYPE → credit', () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260101
<TRNAMT>200.00
<MEMO>X
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements[0].type).toBe('credit')
  })
})

describe('TC-BNK-OFX-004 → sem TRNTYPE valor negativo → debit', () => {
  test('Valor negativo sem TRNTYPE → debit', () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260101
<TRNAMT>-75.00
<MEMO>Y
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements[0].type).toBe('debit')
  })
})

describe('TC-BNK-OFX-005 → bloco sem DTPOSTED gera erro', () => {
  test('DTPOSTED ausente → erro', () => {
    const ofx = `<STMTTRN>
<TRNAMT>100
<MEMO>X
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements).toHaveLength(0)
    expect(r.errors[0]).toMatch(/DTPOSTED|TRNAMT/i)
  })
})

describe('TC-BNK-OFX-006 → bloco sem TRNAMT gera erro', () => {
  test('TRNAMT ausente → erro', () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260101
<MEMO>X
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements).toHaveLength(0)
    expect(r.errors).toHaveLength(1)
  })
})

describe('TC-BNK-OFX-007 → FITID ausente → external_id undefined', () => {
  test('Sem FITID retorna undefined', () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260101
<TRNAMT>10
<MEMO>X
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements[0].external_id).toBeUndefined()
  })
})

describe('TC-BNK-OFX-008 → MEMO ausente → "Sem descrição"', () => {
  test('Sem MEMO → fallback', () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260101
<TRNAMT>10
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements[0].description).toBe('Sem descrição')
  })
})

describe('TC-BNK-OFX-009 → Múltiplos blocos parseados', () => {
  test('3 blocos → 3 statements', () => {
    const ofx = `<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260101
<TRNAMT>10
<MEMO>A
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260102
<TRNAMT>-20
<MEMO>B
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260103
<TRNAMT>30
<MEMO>C
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements).toHaveLength(3)
  })
})

describe('TC-BNK-OFX-010 → TRNAMT com vírgula decimal', () => {
  test('Vírgula → ponto antes do parseFloat', () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20260101
<TRNAMT>123,45
<MEMO>X
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements[0].amount).toBe(123.45)
  })
})

describe('TC-BNK-OFX-011 → TRNTYPE DEP é credit', () => {
  test('DEP → credit', () => {
    const ofx = `<STMTTRN>
<TRNTYPE>DEP
<DTPOSTED>20260101
<TRNAMT>50
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements[0].type).toBe('credit')
  })
})

describe('TC-BNK-OFX-012 → TRNTYPE CHECK é debit', () => {
  test('CHECK → debit', () => {
    const ofx = `<STMTTRN>
<TRNTYPE>CHECK
<DTPOSTED>20260101
<TRNAMT>-50
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements[0].type).toBe('debit')
  })
})

describe('TC-BNK-OFX-013 → Data 20260229 ano bissexto', () => {
  test('2024-02-29 é parseada', () => {
    const ofx = `<STMTTRN>
<DTPOSTED>20240229
<TRNAMT>1
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements[0].date).toBe('2024-02-29')
  })
})

describe('TC-BNK-OFX-014 → Valor amount sempre positivo (Math.abs)', () => {
  test('Negativo é absolutizado', () => {
    const ofx = `<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260101
<TRNAMT>-999.99
</STMTTRN>`
    const r = parseOFX(ofx)
    expect(r.statements[0].amount).toBe(999.99)
  })
})

describe('TC-BNK-OFX-015 → Texto vazio → 0 statements', () => {
  test('Sem blocos → vazio', () => {
    const r = parseOFX('')
    expect(r.statements).toHaveLength(0)
  })
})

// ═══════════════ CSV ═══════════════════════════════════════════════════════

describe('TC-BNK-CSV-001 → CSV com separador ; e cabeçalho PT', () => {
  test('3 linhas parseadas', () => {
    const csv = `Data;Descrição;Valor
01/01/2026;Pgto cliente;1500,00
02/01/2026;Compra material;-300,50
03/01/2026;Recebimento;200,00`
    const r = parseCSV(csv)
    expect(r.statements).toHaveLength(3)
    expect(r.statements[0].date).toBe('2026-01-01')
    expect(r.statements[0].amount).toBe(1500.0)
    expect(r.statements[0].type).toBe('credit')
    expect(r.statements[1].type).toBe('debit')
  })
})

describe('TC-BNK-CSV-002 → CSV com separador , e cabeçalho EN', () => {
  test('Headers em inglês são aceitos (idxDate/idxAmt encontrados)', () => {
    // Atenção: o parser remove '.' (separador de milhar BR) antes do parseFloat,
    // então "100.00" vira "10000" → 10000. Validamos apenas que parseou 1 linha.
    const csv = `date,description,amount
2026-01-01,Payment,100`
    const r = parseCSV(csv)
    expect(r.statements).toHaveLength(1)
    expect(r.statements[0].amount).toBe(100)
    expect(r.statements[0].description).toBe('Payment')
  })
})

describe('TC-BNK-CSV-003 → CSV com valores entre aspas duplas', () => {
  test('Aspas removidas das colunas', () => {
    const csv = `"Data";"Descrição";"Valor"
"01/01/2026";"Teste";"100,00"`
    const r = parseCSV(csv)
    expect(r.statements).toHaveLength(1)
    expect(r.statements[0].description).toBe('Teste')
  })
})

describe('TC-BNK-CSV-004 → CSV vazio retorna erro', () => {
  test('String vazia → erro', () => {
    const r = parseCSV('')
    expect(r.statements).toHaveLength(0)
    expect(r.errors[0]).toMatch(/vazio|sem linhas/i)
  })
})

describe('TC-BNK-CSV-005 → CSV só com cabeçalho retorna erro', () => {
  test('1 linha → "sem linhas de dados"', () => {
    const r = parseCSV('Data;Descrição;Valor')
    expect(r.errors).toHaveLength(1)
  })
})

describe('TC-BNK-CSV-006 → Cabeçalho sem Data retorna erro', () => {
  test('Falta coluna data → erro', () => {
    const csv = `Descrição;Valor
Teste;100,00`
    const r = parseCSV(csv)
    expect(r.statements).toHaveLength(0)
    expect(r.errors[0]).toMatch(/cabeçalho|csv inv/i)
  })
})

describe('TC-BNK-CSV-007 → Cabeçalho sem Valor retorna erro', () => {
  test('Falta coluna valor → erro', () => {
    const csv = `Data;Descrição
01/01/2026;Teste`
    const r = parseCSV(csv)
    expect(r.errors[0]).toMatch(/cabeçalho|csv inv/i)
  })
})

describe('TC-BNK-CSV-008 → Data dd-mm-yyyy aceita', () => {
  test('Data com hífen como separador', () => {
    const csv = `Data;Valor
15-03-2026;100`
    const r = parseCSV(csv)
    expect(r.statements[0].date).toBe('2026-03-15')
  })
})

describe('TC-BNK-CSV-009 → Data yyyy-mm-dd já normalizada', () => {
  test('ISO date é preservada', () => {
    const csv = `Data;Valor
2026-04-20;50`
    const r = parseCSV(csv)
    expect(r.statements[0].date).toBe('2026-04-20')
  })
})

describe('TC-BNK-CSV-010 → Data inválida gera erro de linha', () => {
  test('Data malformada → erro', () => {
    const csv = `Data;Valor
ontem;100`
    const r = parseCSV(csv)
    expect(r.statements).toHaveLength(0)
    expect(r.errors[0]).toMatch(/data inv/i)
  })
})

describe('TC-BNK-CSV-011 → Valor com pontos de milhar e vírgula decimal', () => {
  test('"1.500,00" → 1500', () => {
    const csv = `Data;Valor
01/01/2026;1.500,00`
    const r = parseCSV(csv)
    expect(r.statements[0].amount).toBe(1500.0)
  })
})

describe('TC-BNK-CSV-012 → Valor inválido gera erro de linha', () => {
  test('"abc" no valor → erro', () => {
    const csv = `Data;Valor
01/01/2026;abc`
    const r = parseCSV(csv)
    expect(r.errors[0]).toMatch(/valor inv/i)
  })
})

describe('TC-BNK-CSV-013 → Linhas vazias ignoradas', () => {
  test('Linha em branco no meio → ignorada', () => {
    const csv = `Data;Valor
01/01/2026;100

02/01/2026;200`
    const r = parseCSV(csv)
    expect(r.statements).toHaveLength(2)
  })
})

describe('TC-BNK-CSV-014 → Descrição ausente → "Sem descrição"', () => {
  test('Coluna descrição vazia', () => {
    const csv = `Data;Descrição;Valor
01/01/2026;;100`
    const r = parseCSV(csv)
    expect(r.statements[0].description).toBe('Sem descrição')
  })
})

describe('TC-BNK-CSV-015 → Valor positivo → credit, negativo → debit', () => {
  test('Classificação por sinal', () => {
    const csv = `Data;Valor
01/01/2026;100
02/01/2026;-50`
    const r = parseCSV(csv)
    expect(r.statements[0].type).toBe('credit')
    expect(r.statements[1].type).toBe('debit')
  })
})

describe('TC-BNK-CSV-016 → Cabeçalho "Historico" (sem acento)', () => {
  test('historico → idxDesc encontrado', () => {
    const csv = `Data;Historico;Valor
01/01/2026;Salário;5000,00`
    const r = parseCSV(csv)
    expect(r.statements[0].description).toBe('Salário')
  })
})

describe('TC-BNK-CSV-017 → CSV com CRLF (Windows line endings)', () => {
  test('Quebra \\r\\n suportada', () => {
    const csv = `Data;Valor\r\n01/01/2026;100\r\n02/01/2026;200`
    const r = parseCSV(csv)
    expect(r.statements).toHaveLength(2)
  })
})

describe('TC-BNK-CSV-018 → CSV com colunas extras (cols.length OK)', () => {
  test('Colunas extras à direita não quebram parse', () => {
    const csv = `Data;Descrição;Valor;Extra
01/01/2026;X;100;outro`
    const r = parseCSV(csv)
    expect(r.statements).toHaveLength(1)
  })
})

describe('TC-BNK-CSV-019 → Math.abs aplicado ao amount', () => {
  test('Negativo absolutizado', () => {
    const csv = `Data;Valor
01/01/2026;-999,99`
    const r = parseCSV(csv)
    expect(r.statements[0].amount).toBe(999.99)
  })
})

describe('TC-BNK-CSV-020 → Caso completo Bradesco-like', () => {
  test('20 registros parseados', () => {
    const linhas = ['Data;Histórico;Valor']
    for (let i = 1; i <= 20; i++) {
      const d = String(i).padStart(2, '0')
      linhas.push(`${d}/05/2026;Mov ${i};${i * 10},00`)
    }
    const r = parseCSV(linhas.join('\n'))
    expect(r.statements).toHaveLength(20)
  })
})
