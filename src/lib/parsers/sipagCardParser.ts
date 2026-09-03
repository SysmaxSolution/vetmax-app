// Parser do relatório de vendas da Sipag em XLSX/XLSM ("vendas_realizadas_relatorio_det").
// Layout real (arquivo do cliente, 2026-09-03): cabeçalho na linha 3 (linhas 1-2 = título/
// estabelecimento). Uma linha por PARCELA, com bruto/desconto/líquido e data prevista de
// liquidação. Roda no cliente (exceljs), igual ao parser bancário. Produz StatementRow[]
// consumido por matchCardStatement (mesmo motor de conciliação do CSV).

import type { StatementRow } from '@/lib/actions/card-reconciliation'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ºª°]/g, '').replace(/\s+/g, ' ').trim()

const toNum = (v: unknown): number | null => {
  if (v == null || v === '' || v === '-') return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
  const s = String(v).trim().replace(/[R$\s"]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
const toDate = (v: unknown): string | null => {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).replace(/"/g, '').trim()
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);   if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}
const cellVal = (c: unknown): unknown => {
  if (c instanceof Date) return c
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>
    return o.result ?? o.text ?? (Array.isArray(o.richText) ? (o.richText as { text: string }[]).map(r => r.text).join('') : null) ?? o.hyperlink ?? null
  }
  return c
}

// nome de coluna (normalizado) → campo do StatementRow
const COL: Record<string, keyof StatementRow> = {
  'no da transacao': 'nsu', 'n da transacao': 'nsu', 'numero da transacao': 'nsu',
  'numero da autorizacao': 'authorization', 'no da autorizacao': 'authorization',
  'bandeira': 'brand',
  'parcela': 'installment',
  'total de parcela': 'total_installments', 'total de parcelas': 'total_installments',
  'valor parcela bruto': 'gross',
  'desconto parcela': 'fee',
  'valor parcela liquido': 'net',
  'data da transacao': 'sale_date',
  'data prevista de liquidacao': 'settlement_date',
}

export async function parseSipagCardXlsx(file: File): Promise<{ rows: StatementRow[]; errors: string[] }> {
  const errors: string[] = []
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  // @ts-expect-error exceljs types predates Buffer<T> generic
  await workbook.xlsx.load(Buffer.from(new Uint8Array(await file.arrayBuffer())))
  const ws = workbook.worksheets[0]
  if (!ws) return { rows: [], errors: ['Planilha vazia.'] }

  // 1) acha a linha de cabeçalho (procura "no da transacao" ou "valor parcela bruto")
  let headerRow = -1
  const colIdx: Partial<Record<keyof StatementRow, number>> = {}
  const cancelCol = { idx: -1 }
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const row = ws.getRow(r)
    const names: string[] = []
    for (let j = 1; j <= ws.columnCount; j++) names[j] = norm(String(cellVal(row.getCell(j).value) ?? ''))
    if (names.some(n => n === 'no da transacao' || n === 'valor parcela bruto')) {
      headerRow = r
      for (let j = 1; j <= ws.columnCount; j++) {
        const field = COL[names[j]]
        if (field) colIdx[field] = j
        if (names[j].includes('indicador de cancelamento')) cancelCol.idx = j
      }
      break
    }
  }
  if (headerRow < 0) return { rows: [], errors: ['Cabeçalho da Sipag não reconhecido (esperado "Nº da transação" / "Valor parcela bruto").'] }
  if (colIdx.gross == null || colIdx.net == null) errors.push('Colunas de valor (bruto/líquido) não localizadas — confira o layout.')

  // 2) lê as linhas de dados
  const rows: StatementRow[] = []
  const get = (row: ReturnType<typeof ws.getRow>, f: keyof StatementRow) =>
    colIdx[f] != null ? cellVal(row.getCell(colIdx[f]!).value) : undefined

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const nsu = get(row, 'nsu')
    const gross = toNum(get(row, 'gross'))
    if ((nsu == null || nsu === '') && gross == null) continue           // linha vazia
    if (cancelCol.idx > 0) {
      const canc = String(cellVal(row.getCell(cancelCol.idx).value) ?? '').trim()
      if (canc && canc !== '0' && canc.toLowerCase() !== 'nao' && canc.toLowerCase() !== 'não') continue  // cancelada
    }
    const inst = toNum(get(row, 'installment'))
    const tot  = toNum(get(row, 'total_installments'))
    rows.push({
      nsu:                nsu != null ? String(nsu).replace(/"/g, '').trim() : null,
      authorization:      (() => { const a = get(row, 'authorization'); return a != null ? String(a).replace(/"/g, '').trim() || null : null })(),
      brand:              (() => { const b = get(row, 'brand'); return b != null ? String(b).trim() || null : null })(),
      installment:        inst != null ? Math.round(inst) : null,
      total_installments: tot  != null ? Math.round(tot)  : null,
      gross,
      net:                toNum(get(row, 'net')),
      fee:                toNum(get(row, 'fee')),
      sale_date:          toDate(get(row, 'sale_date')),
      settlement_date:    toDate(get(row, 'settlement_date')),
      raw:                `linha ${r}`,
    })
  }
  if (!rows.length) errors.push('Nenhuma venda encontrada abaixo do cabeçalho.')
  return { rows, errors }
}
